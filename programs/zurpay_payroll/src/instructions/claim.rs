use crate::error::ZurpayError;
use crate::state::{Nullifier, Org, Payrun};
use anchor_lang::prelude::*;
use solana_program::hash::hash;
use solana_program::program::invoke;

/// Public inputs schema version - bump when format changes
pub const PUBLIC_INPUTS_SCHEMA_VERSION: u8 = 3;

/// Expected length of public inputs for v3 schema (Sunspot witness format):
/// 12-byte header + 32 field elements × 32 bytes = 1036 bytes
/// The 32 field elements represent the public_inputs_hash bytes as individual field elements
pub const PUBLIC_INPUTS_LEN_V3: usize = 1036;

/// Legacy v2 length for reference
pub const PUBLIC_INPUTS_LEN_V2: usize = 192;

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump
    )]
    pub org: Account<'info, Org>,

    #[account(
        mut,
        seeds = [Payrun::SEED_PREFIX, org.org_id.as_ref(), payrun.payrun_id.as_ref()],
        bump = payrun.bump,
        constraint = payrun.is_active() @ ZurpayError::PayrunNotActive,
        constraint = payrun.org == org.key() @ ZurpayError::PayrunOrgMismatch
    )]
    pub payrun: Account<'info, Payrun>,

    #[account(
        init,
        payer = claimer,
        space = 8 + Nullifier::INIT_SPACE,
        seeds = [Nullifier::SEED_PREFIX, org.org_id.as_ref(), payrun.payrun_id.as_ref(), nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier: Account<'info, Nullifier>,

    /// CHECK: Validated against org.zk_verifier_program_id - not a global constant
    #[account(constraint = zk_verifier_program.key() == org.zk_verifier_program_id @ ZurpayError::InvalidVerifier)]
    pub zk_verifier_program: UncheckedAccount<'info>,

    /// CHECK: Validated against org.inco_program_id - not a global constant
    #[account(constraint = inco_program.key() == org.inco_program_id @ ZurpayError::InvalidIncoProgram)]
    pub inco_program: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = treasury_conf_account.key() == org.treasury_conf_account @ ZurpayError::InvalidTreasury
    )]
    pub treasury_conf_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub claimer_conf_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, Claim<'info>>,
    nullifier_hash: [u8; 32],
    payout_pubkey_hash: [u8; 32],
    salary_commitment: [u8; 32],
    ciphertext_hash: [u8; 32],
    proof_bytes: Vec<u8>,
    public_inputs: Vec<u8>,
    encrypted_amount: Vec<u8>,
) -> Result<()> {
    let org = &ctx.accounts.org;
    let payrun = &mut ctx.accounts.payrun;
    let nullifier = &mut ctx.accounts.nullifier;
    let clock = Clock::get()?;

    require!(
        !payrun.is_expired(clock.unix_timestamp),
        ZurpayError::PayrunExpired
    );

    verify_public_inputs_v3(
        &public_inputs,
        &payrun.merkle_root,
        &nullifier_hash,
        &payout_pubkey_hash,
        &org.org_id,
        &salary_commitment,
        &ciphertext_hash,
    )?;

    let actual_payout_hash = hash(ctx.accounts.claimer_conf_account.key.as_ref());
    require!(
        actual_payout_hash.to_bytes() == payout_pubkey_hash,
        ZurpayError::PayoutMismatch
    );

    let computed_ciphertext_hash = hash(&encrypted_amount);
    require!(
        computed_ciphertext_hash.to_bytes() == ciphertext_hash,
        ZurpayError::CiphertextMismatch
    );

    verify_zk_proof(
        &ctx.accounts.zk_verifier_program,
        &proof_bytes,
        &public_inputs,
    )?;

    execute_confidential_transfer(
        &ctx.accounts.inco_program,
        &ctx.accounts.treasury_conf_account,
        &ctx.accounts.claimer_conf_account,
        &encrypted_amount,
        ctx.remaining_accounts,
        &org.inco_program_id,
    )?;

    nullifier.nullifier_hash = nullifier_hash;
    nullifier.claimed_at = clock.unix_timestamp;
    nullifier.bump = ctx.bumps.nullifier;

    payrun.claimed_count = payrun
        .claimed_count
        .checked_add(1)
        .ok_or(ZurpayError::Overflow)?;

    emit!(Claimed {
        org_id: org.org_id,
        payrun_id: payrun.payrun_id,
        nullifier_hash,
        payout_pubkey_hash,
        amount_hash: ciphertext_hash,
        claimer: ctx.accounts.claimer.key(),
        claimed_at: clock.unix_timestamp,
    });

    Ok(())
}

fn verify_public_inputs_v3(
    public_inputs: &[u8],
    expected_root: &[u8; 32],
    expected_nullifier: &[u8; 32],
    expected_payout_hash: &[u8; 32],
    expected_org_id: &[u8; 32],
    expected_salary_commitment: &[u8; 32],
    expected_ciphertext_hash: &[u8; 32],
) -> Result<()> {
    // Sunspot witness format: 12-byte header + 32 field elements × 32 bytes = 1036 bytes
    require!(
        public_inputs.len() == PUBLIC_INPUTS_LEN_V3,
        ZurpayError::PublicInputsVersionMismatch
    );

    // Skip the 12-byte header and extract the 32 hash bytes from field elements
    // Each field element is 32 bytes, but only the last byte of each contains our hash byte
    // (since our hash bytes are small values 0-255, they fit in a single byte of the field element)
    let mut extracted_hash = [0u8; 32];
    for i in 0..32 {
        // Each field element is 32 bytes, stored in big-endian format
        // The actual byte value is in the last byte (index 31 of each 32-byte chunk)
        let offset = 12 + i * 32 + 31;
        extracted_hash[i] = public_inputs[offset];
    }

    // Compute expected hash
    let mut preimage = [0u8; 192];
    preimage[0..32].copy_from_slice(expected_root);
    preimage[32..64].copy_from_slice(expected_nullifier);
    preimage[64..96].copy_from_slice(expected_payout_hash);
    preimage[96..128].copy_from_slice(expected_org_id);
    preimage[128..160].copy_from_slice(expected_salary_commitment);
    preimage[160..192].copy_from_slice(expected_ciphertext_hash);

    let expected_hash = hash(&preimage);

    require!(
        extracted_hash == expected_hash.to_bytes(),
        ZurpayError::PublicInputsMismatch
    );

    Ok(())
}

fn verify_zk_proof(
    verifier_program: &UncheckedAccount,
    proof_bytes: &[u8],
    public_inputs: &[u8],
) -> Result<()> {
    // Sunspot verifier expects: proof_bytes + public_witness
    // The public_inputs parameter should be the raw .pw file contents from Sunspot,
    // which already includes the 12-byte header and field elements.
    // Format: proof_bytes + [12-byte header + NR_INPUTS * 32 bytes]
    
    let mut verifier_data = Vec::with_capacity(proof_bytes.len() + public_inputs.len());
    verifier_data.extend_from_slice(proof_bytes);
    verifier_data.extend_from_slice(public_inputs);

    let verify_ix = solana_program::instruction::Instruction {
        program_id: verifier_program.key(),
        accounts: vec![],
        data: verifier_data,
    };

    invoke(&verify_ix, &[]).map_err(|err| {
        msg!("ZK verifier invocation failed: {:?}", err);
        ZurpayError::InvalidProof
    })?;

    Ok(())
}

fn validate_inco_account_owner(account: &UncheckedAccount, inco_program_id: &Pubkey) -> Result<()> {
    if account.owner != inco_program_id {
        return Err(ZurpayError::InvalidIncoAccountOwner.into());
    }
    Ok(())
}

const MAX_REMAINING_ACCOUNTS: usize = 8;

fn validate_remaining_accounts<'info>(
    remaining_accounts: &[AccountInfo<'info>],
    inco_program_id: &Pubkey,
) -> Result<()> {
    require!(
        remaining_accounts.len() <= MAX_REMAINING_ACCOUNTS,
        ZurpayError::TooManyRemainingAccounts
    );

    for (i, acc) in remaining_accounts.iter().enumerate() {
        if acc.owner == inco_program_id || acc.owner == &solana_program::system_program::ID {
            continue;
        }

        if acc.executable {
            require!(
                acc.key == inco_program_id,
                ZurpayError::InvalidRemainingAccount
            );
        }

        msg!(
            "Remaining account {}: owner={}, key={}",
            i,
            acc.owner,
            acc.key
        );
    }

    Ok(())
}

fn execute_confidential_transfer<'info>(
    inco_program: &UncheckedAccount<'info>,
    source: &UncheckedAccount<'info>,
    destination: &UncheckedAccount<'info>,
    encrypted_amount: &[u8],
    remaining_accounts: &[AccountInfo<'info>],
    inco_program_id: &Pubkey,
) -> Result<()> {
    use solana_program::instruction::AccountMeta;

    validate_inco_account_owner(source, inco_program_id)?;
    validate_inco_account_owner(destination, inco_program_id)?;
    validate_remaining_accounts(remaining_accounts, inco_program_id)?;

    let mut accounts = vec![
        AccountMeta::new(*source.key, false),
        AccountMeta::new(*destination.key, false),
    ];

    for (i, acc) in remaining_accounts.iter().enumerate() {
        let is_writable = i < 2;
        accounts.push(if is_writable {
            AccountMeta::new(*acc.key, acc.is_signer)
        } else {
            AccountMeta::new_readonly(*acc.key, acc.is_signer)
        });
    }

    let transfer_ix = solana_program::instruction::Instruction {
        program_id: inco_program.key(),
        accounts,
        data: encrypted_amount.to_vec(),
    };

    let mut account_infos = vec![source.to_account_info(), destination.to_account_info()];
    account_infos.extend(remaining_accounts.iter().cloned());

    invoke(&transfer_ix, &account_infos)?;

    Ok(())
}

#[event]
pub struct Claimed {
    pub org_id: [u8; 32],
    pub payrun_id: [u8; 32],
    pub nullifier_hash: [u8; 32],
    pub payout_pubkey_hash: [u8; 32],
    pub amount_hash: [u8; 32],
    pub claimer: Pubkey,
    pub claimed_at: i64,
}
