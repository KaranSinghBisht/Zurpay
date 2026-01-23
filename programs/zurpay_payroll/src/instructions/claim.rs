use crate::error::ZurpayError;
use crate::state::{Nullifier, Org, Payrun};
use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::{Allow, Operation};
use inco_lightning::cpi::{allow, e_add, e_sub, new_euint128};
use inco_lightning::types::Euint128;

use solana_program::hash::hash;
use solana_program::program::invoke;

pub const PUBLIC_INPUTS_SCHEMA_VERSION: u8 = 4;

/// V4: Single Field element (12-byte header + 1 × 32 bytes = 44 bytes)
pub const PUBLIC_INPUTS_LEN_V4: usize = 44;

/// V3: 32 field elements (12-byte header + 32 × 32 bytes = 1036 bytes) - TOO LARGE FOR TX
pub const PUBLIC_INPUTS_LEN_V3: usize = 1036;

/// V2: Raw concatenated hashes (192 bytes)
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

    /// CHECK: Validated against org.treasury_conf_account - Inco confidential account
    #[account(
        mut,
        constraint = treasury_conf_account.key() == org.treasury_conf_account @ ZurpayError::InvalidTreasury
    )]
    pub treasury_conf_account: UncheckedAccount<'info>,

    /// CHECK: Claimer's Inco confidential account - validated via payout_pubkey_hash in ZK proof
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

    verify_public_inputs(
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
        &ctx.accounts.inco_program.to_account_info(),
        &ctx.accounts.treasury_conf_account.to_account_info(),
        &ctx.accounts.claimer_conf_account.to_account_info(),
        &encrypted_amount,
        ctx.remaining_accounts,
        &ctx.accounts.claimer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
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

fn verify_public_inputs(
    public_inputs: &[u8],
    expected_root: &[u8; 32],
    expected_nullifier: &[u8; 32],
    expected_payout_hash: &[u8; 32],
    expected_org_id: &[u8; 32],
    expected_salary_commitment: &[u8; 32],
    expected_ciphertext_hash: &[u8; 32],
) -> Result<()> {
    match public_inputs.len() {
        PUBLIC_INPUTS_LEN_V4 => verify_public_inputs_v4(
            public_inputs,
            expected_root,
            expected_nullifier,
            expected_payout_hash,
            expected_org_id,
            expected_salary_commitment,
            expected_ciphertext_hash,
        ),
        PUBLIC_INPUTS_LEN_V2 => verify_public_inputs_v2(
            public_inputs,
            expected_root,
            expected_nullifier,
            expected_payout_hash,
            expected_org_id,
            expected_salary_commitment,
            expected_ciphertext_hash,
        ),
        PUBLIC_INPUTS_LEN_V3 => verify_public_inputs_v3(
            public_inputs,
            expected_root,
            expected_nullifier,
            expected_payout_hash,
            expected_org_id,
            expected_salary_commitment,
            expected_ciphertext_hash,
        ),
        _ => {
            msg!("Invalid public inputs length: {}", public_inputs.len());
            Err(ZurpayError::PublicInputsVersionMismatch.into())
        }
    }
}

fn verify_public_inputs_v2(
    public_inputs: &[u8],
    expected_root: &[u8; 32],
    expected_nullifier: &[u8; 32],
    expected_payout_hash: &[u8; 32],
    expected_org_id: &[u8; 32],
    expected_salary_commitment: &[u8; 32],
    expected_ciphertext_hash: &[u8; 32],
) -> Result<()> {
    require!(
        &public_inputs[0..32] == expected_root,
        ZurpayError::PublicInputsMismatch
    );
    require!(
        &public_inputs[32..64] == expected_nullifier,
        ZurpayError::PublicInputsMismatch
    );
    require!(
        &public_inputs[64..96] == expected_payout_hash,
        ZurpayError::PublicInputsMismatch
    );
    require!(
        &public_inputs[96..128] == expected_org_id,
        ZurpayError::PublicInputsMismatch
    );
    require!(
        &public_inputs[128..160] == expected_salary_commitment,
        ZurpayError::PublicInputsMismatch
    );
    require!(
        &public_inputs[160..192] == expected_ciphertext_hash,
        ZurpayError::PublicInputsMismatch
    );
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
    let mut extracted_hash = [0u8; 32];
    for i in 0..32 {
        let offset = 12 + i * 32 + 31;
        extracted_hash[i] = public_inputs[offset];
    }

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

fn verify_public_inputs_v4(
    public_inputs: &[u8],
    expected_root: &[u8; 32],
    expected_nullifier: &[u8; 32],
    expected_payout_hash: &[u8; 32],
    expected_org_id: &[u8; 32],
    expected_salary_commitment: &[u8; 32],
    expected_ciphertext_hash: &[u8; 32],
) -> Result<()> {
    let extracted_field = &public_inputs[12..44];

    let mut preimage = [0u8; 192];
    preimage[0..32].copy_from_slice(expected_root);
    preimage[32..64].copy_from_slice(expected_nullifier);
    preimage[64..96].copy_from_slice(expected_payout_hash);
    preimage[96..128].copy_from_slice(expected_org_id);
    preimage[128..160].copy_from_slice(expected_salary_commitment);
    preimage[160..192].copy_from_slice(expected_ciphertext_hash);

    let expected_hash = hash(&preimage);
    let expected_hash_bytes = expected_hash.to_bytes();

    let mut expected_field = [0u8; 32];
    expected_field[0] = 0;
    expected_field[1..32].copy_from_slice(&expected_hash_bytes[1..32]);

    require!(
        extracted_field == expected_field,
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

/// Execute confidential transfer using Inco Lightning CPIs
///
/// This performs the following FHE operations:
/// 1. Create an encrypted handle from the ciphertext (new_euint128)
/// 2. Subtract amount from treasury balance (e_sub)
/// 3. Add amount to claimer balance (e_add)
/// 4. Grant decryption permission to claimer (allow)
///
/// remaining_accounts layout:
/// [0] treasury_allowance_pda (mut) - PDA for treasury's new balance
/// [1] treasury_owner_address (readonly) - Treasury owner for allowance
/// [2] claimer_allowance_pda (mut) - PDA for claimer's new balance  
/// [3] claimer_owner_address (readonly) - Claimer for allowance
fn execute_confidential_transfer<'info>(
    inco_program: &AccountInfo<'info>,
    treasury_account: &AccountInfo<'info>,
    claimer_account: &AccountInfo<'info>,
    encrypted_amount: &[u8],
    remaining_accounts: &[AccountInfo<'info>],
    signer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    const INPUT_TYPE_EUINT128: u8 = 0;
    const BALANCE_OFFSET: usize = 72;

    let amount_handle = new_euint128(
        CpiContext::new(
            inco_program.clone(),
            Operation {
                signer: signer.clone(),
            },
        ),
        encrypted_amount.to_vec(),
        INPUT_TYPE_EUINT128,
    )?;

    let treasury_data = treasury_account.try_borrow_data()?;
    let treasury_balance = read_euint128_from_account(&treasury_data, BALANCE_OFFSET)?;
    drop(treasury_data);

    let claimer_data = claimer_account.try_borrow_data()?;
    let claimer_balance = read_euint128_from_account(&claimer_data, BALANCE_OFFSET)?;
    drop(claimer_data);

    let new_treasury_balance = e_sub(
        CpiContext::new(
            inco_program.clone(),
            Operation {
                signer: signer.clone(),
            },
        ),
        treasury_balance,
        amount_handle,
        0u8,
    )?;

    let new_claimer_balance = e_add(
        CpiContext::new(
            inco_program.clone(),
            Operation {
                signer: signer.clone(),
            },
        ),
        claimer_balance,
        amount_handle,
        0u8,
    )?;

    let mut treasury_data_mut = treasury_account.try_borrow_mut_data()?;
    write_euint128_to_account(&mut treasury_data_mut, BALANCE_OFFSET, new_treasury_balance)?;
    drop(treasury_data_mut);

    let mut claimer_data_mut = claimer_account.try_borrow_mut_data()?;
    write_euint128_to_account(&mut claimer_data_mut, BALANCE_OFFSET, new_claimer_balance)?;
    drop(claimer_data_mut);

    if remaining_accounts.len() >= 4 {
        let claimer_allowance_pda = &remaining_accounts[2];
        let claimer_owner_address = &remaining_accounts[3];

        allow(
            CpiContext::new(
                inco_program.clone(),
                Allow {
                    allowance_account: claimer_allowance_pda.clone(),
                    signer: signer.clone(),
                    allowed_address: claimer_owner_address.clone(),
                    system_program: system_program.clone(),
                },
            ),
            new_claimer_balance.0,
            true,
            claimer_owner_address.key(),
        )?;
    }

    Ok(())
}

fn read_euint128_from_account(data: &[u8], offset: usize) -> Result<Euint128> {
    if data.len() < offset + 16 {
        return Err(ZurpayError::InvalidAccountData.into());
    }

    let mut handle_bytes = [0u8; 16];
    handle_bytes.copy_from_slice(&data[offset..offset + 16]);

    // Convert little-endian bytes to u128
    let handle = u128::from_le_bytes(handle_bytes);
    Ok(Euint128(handle))
}

fn write_euint128_to_account(data: &mut [u8], offset: usize, handle: Euint128) -> Result<()> {
    if data.len() < offset + 16 {
        return Err(ZurpayError::InvalidAccountData.into());
    }

    let handle_bytes = handle.0.to_le_bytes();
    data[offset..offset + 16].copy_from_slice(&handle_bytes);
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
