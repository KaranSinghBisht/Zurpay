use anchor_lang::prelude::*;

/// Treasury account that holds an encrypted balance using Inco Lightning FHE.
///
/// The `balance` field stores a Euint128 handle - an opaque reference to an encrypted
/// value managed by the Inco Lightning program. The actual encrypted data lives in
/// Inco's global state; we only store the handle here.
///
/// Account layout is designed to match what claim.rs expects:
/// - Offset 0-7: Anchor discriminator (8 bytes)
/// - Offset 8-39: org_id (32 bytes)  
/// - Offset 40-71: admin (32 bytes)
/// - Offset 72-87: balance handle (16 bytes - Euint128)
/// - Offset 88: bump (1 byte)
///
/// Total: 89 bytes + 8 discriminator = 97 bytes
#[account]
#[derive(InitSpace)]
pub struct TreasuryAccount {
    /// Organization this treasury belongs to
    pub org_id: [u8; 32],

    /// Admin who can deposit funds
    pub admin: Pubkey,

    /// Encrypted balance handle (Euint128 - stored as u128)
    /// This is the FHE handle pointing to the encrypted value in Inco's state
    pub balance: u128,

    /// PDA bump seed
    pub bump: u8,
}

impl TreasuryAccount {
    pub const SEED_PREFIX: &'static [u8] = b"treasury";

    /// Offset where the balance handle is stored (after discriminator + org_id + admin)
    /// 8 (discriminator) + 32 (org_id) + 32 (admin) = 72
    pub const BALANCE_OFFSET: usize = 72;
}
