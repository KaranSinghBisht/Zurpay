use crate::error::ZurpayError;
use crate::state::{Org, Payrun, PayrunStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(payrun_id: [u8; 32])]
pub struct SetPayrun<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump,
        constraint = org.admin == admin.key() @ ZurpayError::Unauthorized
    )]
    pub org: Account<'info, Org>,

    #[account(
        init,
        payer = admin,
        space = 8 + Payrun::INIT_SPACE,
        seeds = [Payrun::SEED_PREFIX, org.org_id.as_ref(), payrun_id.as_ref()],
        bump
    )]
    pub payrun: Account<'info, Payrun>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SetPayrun>,
    payrun_id: [u8; 32],
    merkle_root: [u8; 32],
    total_employees: u32,
    claim_deadline: i64,
) -> Result<()> {
    let org = &mut ctx.accounts.org;
    let payrun = &mut ctx.accounts.payrun;
    let clock = Clock::get()?;

    require!(merkle_root != [0u8; 32], ZurpayError::InvalidMerkleRootZero);

    require!(total_employees > 0, ZurpayError::InvalidTotalEmployees);

    require!(
        claim_deadline > clock.unix_timestamp,
        ZurpayError::InvalidClaimDeadline
    );

    payrun.org = org.key();
    payrun.payrun_id = payrun_id;
    payrun.merkle_root = merkle_root;
    payrun.total_employees = total_employees;
    payrun.claimed_count = 0;
    payrun.claim_deadline = claim_deadline;
    payrun.created_at = clock.unix_timestamp;
    payrun.status = PayrunStatus::Active;
    payrun.bump = ctx.bumps.payrun;

    org.payrun_counter += 1;

    emit!(PayrunSet {
        org_id: org.org_id,
        payrun_id,
        merkle_root,
        total_employees,
        claim_deadline,
    });

    Ok(())
}

#[event]
pub struct PayrunSet {
    pub org_id: [u8; 32],
    pub payrun_id: [u8; 32],
    pub merkle_root: [u8; 32],
    pub total_employees: u32,
    pub claim_deadline: i64,
}
