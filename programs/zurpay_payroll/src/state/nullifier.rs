use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Nullifier {
    pub nullifier_hash: [u8; 32],
    pub claimed_at: i64,
    pub bump: u8,
}

impl Nullifier {
    pub const SEED_PREFIX: &'static [u8] = b"null";
}
