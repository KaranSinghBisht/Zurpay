use anchor_lang::prelude::*;

/// In testing mode, all program IDs are approved (for unit tests with random keypairs)
#[cfg(feature = "testing")]
pub fn is_approved_verifier(_program_id: &Pubkey) -> bool {
    true
}

#[cfg(feature = "testing")]
pub fn is_approved_inco(_program_id: &Pubkey) -> bool {
    true
}

/// Production/devnet mode: validate against whitelist
#[cfg(all(feature = "devnet", not(feature = "testing")))]
pub mod approved_programs {
    pub const ZK_VERIFIER_PROGRAMS: &[&str] = &["HbBb7nk8MPexLpcHXP2sPLVdVm2TmXaqneHkQ1pnQSMS"];

    pub const INCO_PROGRAMS: &[&str] = &[
        "IncoDEV1111111111111111111111111111111111",
        "IncoDEV2222222222222222222222222222222222",
        "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj",
    ];
}

#[cfg(all(not(feature = "devnet"), not(feature = "testing")))]
pub mod approved_programs {
    pub const ZK_VERIFIER_PROGRAMS: &[&str] = &["SunspotPRD11111111111111111111111111111111"];

    pub const INCO_PROGRAMS: &[&str] = &["IncoPRD1111111111111111111111111111111111"];
}

#[cfg(not(feature = "testing"))]
pub fn is_approved_verifier(program_id: &Pubkey) -> bool {
    let program_str = program_id.to_string();
    approved_programs::ZK_VERIFIER_PROGRAMS
        .iter()
        .any(|&approved| approved == program_str)
}

#[cfg(not(feature = "testing"))]
pub fn is_approved_inco(program_id: &Pubkey) -> bool {
    let program_str = program_id.to_string();
    approved_programs::INCO_PROGRAMS
        .iter()
        .any(|&approved| approved == program_str)
}
