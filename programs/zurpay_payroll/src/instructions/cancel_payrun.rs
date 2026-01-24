use crate::error::ZurpayError;
use crate::state::{Org, Payrun, PayrunStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelPayrun<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump,
        constraint = org.admin == admin.key() @ ZurpayError::Unauthorized
    )]
    pub org: Account<'info, Org>,

    #[account(
        mut,
        seeds = [Payrun::SEED_PREFIX, org.org_id.as_ref(), payrun.payrun_id.as_ref()],
        bump = payrun.bump,
        constraint = payrun.org == org.key() @ ZurpayError::PayrunOrgMismatch,
        constraint = payrun.status == PayrunStatus::Active @ ZurpayError::PayrunNotActive
    )]
    pub payrun: Account<'info, Payrun>,
}

pub fn handler(ctx: Context<CancelPayrun>) -> Result<()> {
    let payrun = &mut ctx.accounts.payrun;
    let clock = Clock::get()?;

    payrun.status = PayrunStatus::Cancelled;

    emit!(PayrunCancelled {
        org_id: ctx.accounts.org.org_id,
        payrun_id: payrun.payrun_id,
        total_claimed: payrun.claimed_count,
        total_employees: payrun.total_employees,
        cancelled_at: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct PayrunCancelled {
    pub org_id: [u8; 32],
    pub payrun_id: [u8; 32],
    pub total_claimed: u32,
    pub total_employees: u32,
    pub cancelled_at: i64,
}
