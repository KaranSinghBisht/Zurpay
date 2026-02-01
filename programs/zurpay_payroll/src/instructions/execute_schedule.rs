use crate::error::ZurpayError;
use crate::state::{Org, Payrun, PayrunStatus, RecurringSchedule};
use anchor_lang::prelude::*;
use solana_program::hash::hash;

#[derive(Accounts)]
pub struct ExecuteSchedule<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump
    )]
    pub org: Account<'info, Org>,

    #[account(
        mut,
        seeds = [RecurringSchedule::SEED_PREFIX, org.org_id.as_ref(), schedule.schedule_id.as_ref()],
        bump = schedule.bump,
        constraint = schedule.org == org.key() @ ZurpayError::ScheduleOrgMismatch
    )]
    pub schedule: Account<'info, RecurringSchedule>,

    #[account(
        init,
        payer = executor,
        space = 8 + Payrun::INIT_SPACE,
        seeds = [Payrun::SEED_PREFIX, org.org_id.as_ref(), &generate_payrun_id(schedule.key(), schedule.execution_count)],
        bump
    )]
    pub payrun: Account<'info, Payrun>,

    pub system_program: Program<'info, System>,
}

fn generate_payrun_id(schedule: Pubkey, execution_count: u32) -> [u8; 32] {
    let mut data = schedule.to_bytes().to_vec();
    data.extend_from_slice(&execution_count.to_le_bytes());
    hash(&data).to_bytes()
}

pub fn handler(ctx: Context<ExecuteSchedule>, merkle_root: [u8; 32]) -> Result<()> {
    let schedule = &mut ctx.accounts.schedule;
    let org = &ctx.accounts.org;
    let payrun = &mut ctx.accounts.payrun;
    let clock = Clock::get()?;

    require!(schedule.is_active(), ZurpayError::ScheduleNotActive);
    require!(
        schedule.is_due(clock.unix_timestamp),
        ZurpayError::ScheduleNotDue
    );
    require!(merkle_root != [0u8; 32], ZurpayError::InvalidMerkleRootZero);

    let payrun_id = generate_payrun_id(schedule.key(), schedule.execution_count);
    let claim_deadline = clock.unix_timestamp + (schedule.claim_window_days as i64 * 24 * 60 * 60);

    payrun.org = org.key();
    payrun.payrun_id = payrun_id;
    payrun.merkle_root = merkle_root;
    payrun.total_employees = schedule.total_employees;
    payrun.claimed_count = 0;
    payrun.claim_deadline = claim_deadline;
    payrun.created_at = clock.unix_timestamp;
    payrun.status = PayrunStatus::Active;
    payrun.bump = ctx.bumps.payrun;

    schedule.last_execution = clock.unix_timestamp;
    schedule.next_execution = schedule.calculate_next_execution(clock.unix_timestamp);
    schedule.execution_count += 1;

    emit!(ScheduleExecuted {
        org_id: org.org_id,
        schedule_id: schedule.schedule_id,
        payrun_id,
        merkle_root,
        execution_count: schedule.execution_count,
        next_execution: schedule.next_execution,
        executor: ctx.accounts.executor.key(),
    });

    Ok(())
}

#[event]
pub struct ScheduleExecuted {
    pub org_id: [u8; 32],
    pub schedule_id: [u8; 32],
    pub payrun_id: [u8; 32],
    pub merkle_root: [u8; 32],
    pub execution_count: u32,
    pub next_execution: i64,
    pub executor: Pubkey,
}
