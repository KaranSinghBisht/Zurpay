---
sidebar_position: 3
title: ZK Circuit
---

# ZK Circuit

Zurpay uses a Noir zero-knowledge circuit to prove claim eligibility without revealing employee identity.

## Overview

| Property         | Value                          |
| ---------------- | ------------------------------ |
| Language         | Noir                           |
| Proof System     | Groth16 (via Sunspot)          |
| Public Inputs    | 192 bytes (6 × 32-byte fields) |
| Circuit Location | `circuits/claim_eligibility/`  |

## What the Circuit Proves

The circuit proves knowledge of private inputs such that:

1. **Merkle Membership** — A leaf derived from the private inputs exists in the Merkle tree
2. **Nullifier Derivation** — The nullifier is correctly computed from the secret
3. **Wallet Binding** — The payout address hash matches the claimer's wallet
4. **Amount Binding** — The ciphertext hash matches the encrypted amount

## Circuit Interface

### Public Inputs

```noir
// 192 bytes total
merkle_root: [u8; 32],        // Payrun Merkle root
nullifier: [u8; 32],          // Derived from secret
payout_pubkey_hash: [u8; 32], // sha256(wallet_pubkey)
org_id: [u8; 32],             // Organization identifier
salary_commitment: [u8; 32],  // Commitment to salary amount
ciphertext_hash: [u8; 32],    // sha256(encrypted_amount)
```

### Private Inputs

```noir
secret: [u8; 32],             // Employee's secret (from claim token)
employee_commitment: [u8; 32], // Derived from email + secret
salary: u64,                  // Actual salary amount
salary_randomness: [u8; 32],  // Randomness for salary commitment
merkle_path: [[u8; 32]; DEPTH], // Merkle proof
merkle_indices: [bool; DEPTH],  // Path directions
payrun_id: [u8; 32],          // Payrun identifier
```

## Merkle Leaf Structure

```
leaf = sha256(
    payrun_id ||
    employee_commitment ||
    salary_commitment ||
    ciphertext_hash ||
    payout_pubkey_hash
)
```

### Employee Commitment

```
employee_commitment = sha256(email || secret)
```

This binds the claim to a specific email without revealing it.

### Salary Commitment

```
salary_commitment = pedersen_commit(salary, salary_randomness)
```

A Pedersen commitment hides the salary while allowing verification.

## Circuit Logic

```noir
fn main(
    // Public inputs
    merkle_root: pub [u8; 32],
    nullifier: pub [u8; 32],
    payout_pubkey_hash: pub [u8; 32],
    org_id: pub [u8; 32],
    salary_commitment: pub [u8; 32],
    ciphertext_hash: pub [u8; 32],

    // Private inputs
    secret: [u8; 32],
    employee_commitment: [u8; 32],
    salary: u64,
    salary_randomness: [u8; 32],
    merkle_path: [[u8; 32]; 20],
    merkle_indices: [bool; 20],
    payrun_id: [u8; 32],
) {
    // 1. Verify nullifier derivation
    let computed_nullifier = sha256(secret || payrun_id);
    assert(computed_nullifier == nullifier);

    // 2. Verify salary commitment
    let computed_commitment = pedersen_commit(salary, salary_randomness);
    assert(computed_commitment == salary_commitment);

    // 3. Compute Merkle leaf
    let leaf = sha256(
        payrun_id ||
        employee_commitment ||
        salary_commitment ||
        ciphertext_hash ||
        payout_pubkey_hash
    );

    // 4. Verify Merkle membership
    let computed_root = compute_merkle_root(leaf, merkle_path, merkle_indices);
    assert(computed_root == merkle_root);
}
```

## Proof Generation

### Using Nargo (CLI)

```bash
cd circuits/claim_eligibility

# Compile circuit
nargo compile

# Generate witness
nargo execute

# Generate proof (requires prover backend)
sunspot prove --circuit target/claim_eligibility.json
```

### Using Payroll Builder Service

The service generates proofs automatically:

```typescript
// Called during payrun validation
const proof = await generateClaimProof({
  secret,
  employeeCommitment,
  salary,
  salaryRandomness,
  merklePath,
  merkleIndices,
  payrunId,
  // ... other inputs
});
```

## Verification

### On-Chain (Sunspot)

The Zurpay program calls Sunspot verifier via CPI:

```rust
sunspot::cpi::verify_proof(
    cpi_ctx,
    proof,           // Groth16 proof bytes
    public_inputs,   // 192 bytes
)?;
```

### Off-Chain (Testing)

```bash
sunspot verify \
  --proof proof.json \
  --public-inputs public_inputs.json \
  --vk verification_key.json
```

## Security Properties

### Soundness

An invalid proof cannot pass verification (cryptographic guarantee).

### Zero-Knowledge

The proof reveals nothing about:

- Employee email
- Actual salary amount
- Employee's secret

### Binding

| Binding        | Mechanism                           |
| -------------- | ----------------------------------- |
| Proof → Payrun | merkle_root in public inputs        |
| Proof → Wallet | payout_pubkey_hash in public inputs |
| Proof → Amount | ciphertext_hash in public inputs    |
| Claim → Secret | nullifier derived from secret       |

## Circuit Constraints

| Constraint                                | Purpose                              |
| ----------------------------------------- | ------------------------------------ |
| Nullifier = sha256(secret \|\| payrun_id) | Deterministic, prevents double-claim |
| Salary commitment verification            | Ensures claimed amount matches       |
| Merkle membership                         | Proves inclusion in payrun           |

## Development

### Prerequisites

```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
noirup
```

### Compile

```bash
cd circuits/claim_eligibility
nargo compile
```

### Test

```bash
nargo test
```

### Modify Circuit

1. Edit `src/main.nr`
2. Update `Prover.toml` with test inputs
3. Run `nargo execute` to test
4. Update Payroll Builder if inputs changed
