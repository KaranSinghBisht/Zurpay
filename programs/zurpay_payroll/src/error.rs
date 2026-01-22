use anchor_lang::prelude::*;

#[error_code]
pub enum ZurpayError {
    #[msg("Payrun has expired")]
    PayrunExpired,
    
    #[msg("Nullifier already used - claim already made")]
    NullifierAlreadyUsed,
    
    #[msg("Invalid ZK proof")]
    InvalidProof,
    
    #[msg("Public inputs mismatch")]
    PublicInputsMismatch,
    
    #[msg("Unauthorized - only admin can perform this action")]
    Unauthorized,
    
    #[msg("Payrun not active")]
    PayrunNotActive,
    
    #[msg("Invalid merkle root")]
    InvalidMerkleRoot,
    
    #[msg("Treasury account does not match org configuration")]
    InvalidTreasury,
    
    #[msg("Payout account does not match proof commitment")]
    PayoutMismatch,
    
    #[msg("Invalid ZK verifier program")]
    InvalidVerifier,
    
    #[msg("Payrun does not belong to this org")]
    PayrunOrgMismatch,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Payrun has not expired yet")]
    PayrunNotExpired,
    
    #[msg("Public inputs schema version mismatch - expected v2 (192 bytes)")]
    PublicInputsVersionMismatch,
    
    #[msg("Salary commitment does not match proof")]
    SalaryCommitmentMismatch,
    
    #[msg("Encrypted amount hash does not match ciphertext_hash in proof")]
    CiphertextMismatch,
    
    #[msg("Merkle root cannot be zero")]
    InvalidMerkleRootZero,
    
    #[msg("Total employees must be greater than zero")]
    InvalidTotalEmployees,
    
    #[msg("Claim deadline must be in the future")]
    InvalidClaimDeadline,
    
    #[msg("Payrun is cancelled")]
    PayrunCancelled,
    
    #[msg("Invalid Inco confidential account owner")]
    InvalidIncoAccountOwner,
    
    #[msg("Invalid Inco program - does not match org configuration")]
    InvalidIncoProgram,
    
    #[msg("ZK verifier program is not in the approved registry")]
    VerifierNotInRegistry,
    
    #[msg("Inco program is not in the approved registry")]
    IncoNotInRegistry,
    
    #[msg("Too many remaining accounts provided (max 8)")]
    TooManyRemainingAccounts,
    
    #[msg("Invalid remaining account - unexpected owner or executable")]
    InvalidRemainingAccount,
}
