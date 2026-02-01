---
sidebar_position: 2
title: Smart Contracts
---

# Smart Contracts

Zurpay's on-chain logic is implemented as an Anchor program on Solana.

## Program Overview

| Property   | Value                                          |
| ---------- | ---------------------------------------------- |
| Program ID | `Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9` |
| Framework  | Anchor                                         |
| Network    | Solana Devnet                                  |

## Account Structure

### Organization

```rust
#[account]
pub struct Organization {
    pub admin: Pubkey,
    pub name: String,
    pub treasury: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}
```

**PDA Derivation:**

```
seeds = ["organization", admin.key()]
```

### Payrun

```rust
#[account]
pub struct Payrun {
    pub org: Pubkey,
    pub merkle_root: [u8; 32],
    pub total_amount: u64,
    pub claims_opened: bool,
    pub created_at: i64,
    pub bump: u8,
}
```

**PDA Derivation:**

```
seeds = ["payrun", org.key(), merkle_root]
```

### Nullifier

```rust
#[account]
pub struct Nullifier {
    pub payrun: Pubkey,
    pub nullifier: [u8; 32],
    pub claimed_at: i64,
    pub bump: u8,
}
```

**PDA Derivation:**

```
seeds = ["nullifier", payrun.key(), nullifier_bytes]
```

## Instructions

### initialize_organization

Creates a new organization with treasury.

```rust
pub fn initialize_organization(
    ctx: Context<InitializeOrganization>,
    name: String,
) -> Result<()>
```

**Accounts:**

- `admin` (signer) — Organization admin
- `organization` (init) — Organization PDA
- `treasury` (init) — Inco token account

### create_payrun

Posts a payrun Merkle root on-chain.

```rust
pub fn create_payrun(
    ctx: Context<CreatePayrun>,
    merkle_root: [u8; 32],
    total_amount: u64,
) -> Result<()>
```

**Accounts:**

- `admin` (signer) — Must be org admin
- `organization` — Organization PDA
- `payrun` (init) — Payrun PDA

### open_claims

Enables employees to claim from payrun.

```rust
pub fn open_claims(
    ctx: Context<OpenClaims>,
) -> Result<()>
```

**Accounts:**

- `admin` (signer) — Must be org admin
- `payrun` (mut) — Payrun to open

### claim_payment

Verifies ZK proof and executes confidential transfer.

```rust
pub fn claim_payment(
    ctx: Context<ClaimPayment>,
    proof: Vec<u8>,
    public_inputs: [u8; 192],
    encrypted_amount: Vec<u8>,
) -> Result<()>
```

**Accounts:**

- `claimer` (signer) — Employee wallet
- `payrun` — Payrun being claimed from
- `nullifier` (init) — Nullifier PDA
- `treasury` — Org treasury (source)
- `recipient` — Claimer's Inco account (destination)
- `verifier_program` — Sunspot verifier
- `inco_program` — Inco Lightning

**Verification Flow:**

1. Deserialize public inputs
2. Verify merkle_root matches payrun
3. Verify payout_pubkey_hash matches claimer
4. Call Sunspot verifier CPI
5. Create nullifier PDA (fails if exists)
6. Execute Inco transfer CPI

## Public Inputs Layout

The 192-byte public inputs array:

| Offset | Size | Field              | Description                   |
| ------ | ---- | ------------------ | ----------------------------- |
| 0      | 32   | merkle_root        | Payrun Merkle root            |
| 32     | 32   | nullifier          | Unique claim identifier       |
| 64     | 32   | payout_pubkey_hash | sha256(claimer.key())         |
| 96     | 32   | org_id             | Organization pubkey bytes     |
| 128    | 32   | salary_commitment  | Pedersen commitment to salary |
| 160    | 32   | ciphertext_hash    | sha256(encrypted_amount)      |

## Error Codes

```rust
#[error_code]
pub enum ZurpayError {
    #[msg("Claims not yet opened for this payrun")]
    ClaimsNotOpened,

    #[msg("Invalid merkle root")]
    InvalidMerkleRoot,

    #[msg("Invalid payout pubkey hash")]
    InvalidPayoutPubkey,

    #[msg("Proof verification failed")]
    ProofVerificationFailed,

    #[msg("Nullifier already used")]
    NullifierAlreadyUsed,

    #[msg("Unauthorized")]
    Unauthorized,
}
```

## Security Considerations

### Proof Verification

The program delegates proof verification to Sunspot via CPI:

```rust
let cpi_accounts = VerifyProof {
    // ... Sunspot accounts
};
let cpi_ctx = CpiContext::new(verifier_program, cpi_accounts);
sunspot::cpi::verify_proof(cpi_ctx, proof, public_inputs)?;
```

### Nullifier Uniqueness

Nullifiers are stored as PDAs. Attempting to create a duplicate PDA fails:

```rust
// PDA derivation ensures uniqueness
seeds = ["nullifier", payrun.key(), nullifier_bytes]

// Anchor's init constraint fails if PDA exists
#[account(init, ...)]
pub nullifier: Account<'info, Nullifier>,
```

### Treasury Access

Only the Zurpay program can transfer from treasury during claims:

```rust
// Treasury PDA is program-derived
// Transfer requires program signature via PDA seeds
```

## Testing

Run Anchor tests:

```bash
cd programs/zurpay_payroll
anchor test
```

## Deployment

Deploy to devnet:

```bash
solana config set --url devnet
anchor deploy
```

Verify deployment:

```bash
solana program show Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9 --url devnet
```
