use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PayrunStatus {
    Active,
    Completed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Payrun {
    pub org: Pubkey,
    pub payrun_id: [u8; 32],
    pub merkle_root: [u8; 32],
    pub total_employees: u32,
    pub claimed_count: u32,
    pub claim_deadline: i64,
    pub created_at: i64,
    pub status: PayrunStatus,
    pub bump: u8,
}

impl Payrun {
    pub const SEED_PREFIX: &'static [u8] = b"payrun";

    pub fn is_active(&self) -> bool {
        self.status == PayrunStatus::Active
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time > self.claim_deadline
    }
}
