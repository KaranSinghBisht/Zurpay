use anchor_lang::prelude::*;

/// Employee confidential account that holds an encrypted balance using Inco Lightning FHE.
///
/// Similar to TreasuryAccount but for individual employees.
/// The `balance` field stores a Euint128 handle.
///
/// Account layout:
/// - Offset 0-7: Anchor discriminator (8 bytes)
/// - Offset 8-39: owner wallet (32 bytes)  
/// - Offset 40-71: org_id (32 bytes)
/// - Offset 72-87: balance handle (16 bytes - Euint128)
/// - Offset 88: bump (1 byte)
#[account]
#[derive(InitSpace)]
pub struct EmployeeConfAccount {
    /// The employee's wallet that owns this conf account
    pub owner: Pubkey,

    /// Organization this account is associated with
    pub org_id: [u8; 32],

    /// Encrypted balance handle (Euint128 - stored as u128)
    pub balance: u128,

    /// PDA bump seed
    pub bump: u8,
}

impl EmployeeConfAccount {
    pub const SEED_PREFIX: &'static [u8] = b"employee_conf";

    /// Offset where the balance handle is stored
    /// 8 (discriminator) + 32 (owner) + 32 (org_id) = 72
    pub const BALANCE_OFFSET: usize = 72;
}
