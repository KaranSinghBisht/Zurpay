use crate::error::ZurpayError;
use crate::state::{Org, RecurringSchedule, ScheduleStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PauseSchedule<'info> {
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

pub fn handler(ctx: Context<PauseSchedule>) -> Result<()> {
    let schedule = &mut ctx.accounts.schedule;

    require!(
        schedule.status == ScheduleStatus::Active,
        ZurpayError::ScheduleNotActive
    );

    schedule.status = ScheduleStatus::Paused;

    emit!(SchedulePaused {
        org_id: ctx.accounts.org.org_id,
        schedule_id: schedule.schedule_id,
    });

    Ok(())
}

#[event]
pub struct SchedulePaused {
    pub org_id: [u8; 32],
    pub schedule_id: [u8; 32],
}
