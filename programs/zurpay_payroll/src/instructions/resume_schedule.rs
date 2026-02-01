use crate::error::ZurpayError;
use crate::state::{Org, RecurringSchedule, ScheduleStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResumeSchedule<'info> {
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
        seeds = [RecurringSchedule::SEED_PREFIX, org.org_id.as_ref(), schedule.schedule_id.as_ref()],
        bump = schedule.bump,
        constraint = schedule.org == org.key() @ ZurpayError::ScheduleOrgMismatch
    )]
    pub schedule: Account<'info, RecurringSchedule>,
}

pub fn handler(ctx: Context<ResumeSchedule>, next_execution: i64) -> Result<()> {
    let schedule = &mut ctx.accounts.schedule;
    let clock = Clock::get()?;

    require!(
        schedule.status == ScheduleStatus::Paused,
        ZurpayError::ScheduleNotPaused
    );
    require!(
        next_execution > clock.unix_timestamp,
        ZurpayError::ScheduleExecutionInPast
    );

    schedule.status = ScheduleStatus::Active;
    schedule.next_execution = next_execution;

    emit!(ScheduleResumed {
        org_id: ctx.accounts.org.org_id,
        schedule_id: schedule.schedule_id,
        next_execution,
    });

    Ok(())
}

#[event]
pub struct ScheduleResumed {
    pub org_id: [u8; 32],
    pub schedule_id: [u8; 32],
    pub next_execution: i64,
}
