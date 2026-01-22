use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Org {
    pub org_id: [u8; 32],
    pub admin: Pubkey,
    pub treasury_conf_account: Pubkey,
    /// ZK verifier program for claim proofs - org-specific to allow upgrades
    pub zk_verifier_program_id: Pubkey,
    /// Inco Lightning program for confidential transfers - org-specific
    pub inco_program_id: Pubkey,
    pub payrun_counter: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Org {
    pub const SEED_PREFIX: &'static [u8] = b"org";
}
