use crate::error::ZurpayError;
use crate::state::{Org, RecurringSchedule, ScheduleFrequency, ScheduleStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(schedule_id: [u8; 32])]
pub struct CreateSchedule<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump,
        constraint = org.admin == admin.key() @ ZurpayError::Unauthorized
    )]
    pub org: Account<'info, Org>,

    #[account(
        init,
        payer = admin,
        space = 8 + RecurringSchedule::INIT_SPACE,
        seeds = [RecurringSchedule::SEED_PREFIX, org.org_id.as_ref(), schedule_id.as_ref()],
        bump
    )]
    pub schedule: Account<'info, RecurringSchedule>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateSchedule>,
    schedule_id: [u8; 32],
    frequency: ScheduleFrequency,
    first_execution: i64,
    total_employees: u32,
    claim_window_days: u8,
) -> Result<()> {
    let schedule = &mut ctx.accounts.schedule;
    let org = &ctx.accounts.org;
    let clock = Clock::get()?;

    require!(total_employees > 0, ZurpayError::InvalidTotalEmployees);
    require!(
        first_execution > clock.unix_timestamp,
        ZurpayError::ScheduleExecutionInPast
    );
    require!(claim_window_days > 0, ZurpayError::InvalidClaimWindow);

    schedule.org = org.key();
    schedule.schedule_id = schedule_id;
    schedule.frequency = frequency;
    schedule.next_execution = first_execution;
    schedule.last_execution = 0;
    schedule.total_employees = total_employees;
    schedule.claim_window_days = claim_window_days;
    schedule.execution_count = 0;
    schedule.status = ScheduleStatus::Active;
    schedule.created_at = clock.unix_timestamp;
    schedule.bump = ctx.bumps.schedule;

    emit!(ScheduleCreated {
        org_id: org.org_id,
        schedule_id,
        frequency,
        first_execution,
        total_employees,
    });

    Ok(())
}

#[event]
pub struct ScheduleCreated {
    pub org_id: [u8; 32],
    pub schedule_id: [u8; 32],
    pub frequency: ScheduleFrequency,
    pub first_execution: i64,
    pub total_employees: u32,
}
