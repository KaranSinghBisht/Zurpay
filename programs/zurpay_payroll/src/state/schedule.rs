use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ScheduleFrequency {
    Weekly,
    Biweekly,
    Monthly,
    SemiMonthly,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ScheduleStatus {
    Active,
    Paused,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct RecurringSchedule {
    pub org: Pubkey,
    pub schedule_id: [u8; 32],
    pub frequency: ScheduleFrequency,
    pub next_execution: i64,
    pub last_execution: i64,
    pub total_employees: u32,
    pub claim_window_days: u8,
    pub execution_count: u32,
    pub status: ScheduleStatus,
    pub created_at: i64,
    pub bump: u8,
}

impl RecurringSchedule {
    pub const SEED_PREFIX: &'static [u8] = b"schedule";

    pub fn is_active(&self) -> bool {
        self.status == ScheduleStatus::Active
    }

    pub fn is_due(&self, current_time: i64) -> bool {
        self.is_active() && current_time >= self.next_execution
    }

    pub fn calculate_next_execution(&self, from_time: i64) -> i64 {
        match self.frequency {
            ScheduleFrequency::Weekly => from_time + (7 * 24 * 60 * 60),
            ScheduleFrequency::Biweekly => from_time + (14 * 24 * 60 * 60),
            ScheduleFrequency::Monthly => from_time + (30 * 24 * 60 * 60),
            ScheduleFrequency::SemiMonthly => from_time + (15 * 24 * 60 * 60),
        }
    }
}
