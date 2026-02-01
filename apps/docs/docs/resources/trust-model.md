---
sidebar_position: 2
title: Trust Model
---

# Trust Model

Understanding what Zurpay cryptographically enforces vs. what requires trust.

## Overview

Zurpay uses a combination of zero-knowledge proofs, on-chain verification, and trusted services. This document clarifies the trust boundaries.

## Cryptographically Enforced

These properties are guaranteed by math and cannot be violated without breaking cryptographic assumptions.

### ZK Proof Verification

| Property                 | Guarantee                                                       |
| ------------------------ | --------------------------------------------------------------- |
| **Claim eligibility**    | Only someone in the Merkle tree can generate a valid proof      |
| **Nullifier uniqueness** | Same secret + payrun always produces same nullifier             |
| **Wallet binding**       | Proof is bound to specific wallet via payout_pubkey_hash        |
| **Amount binding**       | Proof is bound to specific encrypted amount via ciphertext_hash |

**Trust assumption:** Groth16 proof system is sound (standard cryptographic assumption).

### On-Chain State

| Property                     | Guarantee                               |
| ---------------------------- | --------------------------------------- |
| **Double-claim prevention**  | Nullifier PDAs prevent replay           |
| **Merkle root immutability** | Once posted, root cannot be changed     |
| **Treasury authorization**   | Only program can transfer during claims |

**Trust assumption:** Solana validators are honest (standard blockchain assumption).

### Amount Encryption

| Property             | Guarantee                               |
| -------------------- | --------------------------------------- |
| **On-chain privacy** | Transfer amounts encrypted via Inco FHE |
| **Balance privacy**  | Account balances encrypted              |

**Trust assumption:** FHE scheme is semantically secure.

## Requires Trust

These components are not cryptographically verified and require trust in operators.

### Payroll Builder Service

| Trust Required          | Reason                                            |
| ----------------------- | ------------------------------------------------- |
| **Proof generation**    | Service generates proofs from private inputs      |
| **Claim token storage** | Service holds mapping of tokens to claim packages |
| **Email delivery**      | Service sends claim links to employees            |

**Risk if malicious:**

- Could generate proofs for unauthorized claims (but would need valid secrets)
- Could leak claim amounts before they're encrypted
- Could fail to deliver claim links

**Mitigation:**

- Open source code (auditable)
- Self-hostable by organizations
- Proofs are verified on-chain regardless of generator

### Inco Network

| Trust Required      | Reason                                      |
| ------------------- | ------------------------------------------- |
| **FHE computation** | Inco nodes perform encrypted operations     |
| **Key management**  | Threshold key shares held by Inco operators |

**Risk if malicious:**

- Could potentially decrypt amounts (with threshold collusion)
- Could censor transactions

**Mitigation:**

- Threshold cryptography requires multiple parties to collude
- Inco network is decentralizing over time
- Transaction execution is still on Solana

### Claim Link Distribution

| Trust Required     | Reason                                |
| ------------------ | ------------------------------------- |
| **Email delivery** | Links sent via email provider         |
| **Link secrecy**   | Anyone with link can see claim amount |

**Risk if compromised:**

- Claim amounts could be exposed to email provider
- Links could be intercepted

**Mitigation:**

- Claim execution still requires wallet signature
- Alternative distribution methods (direct message, portal)
- Amount is only visible until claimed, then encrypted on-chain

## Trust Comparison

| Property        | Zurpay          | Traditional Payroll | Public Blockchain |
| --------------- | --------------- | ------------------- | ----------------- |
| Salary privacy  | Encrypted       | Provider sees all   | Fully public      |
| Employee list   | Hidden (Merkle) | Provider sees all   | Fully public      |
| Double-payment  | Cryptographic   | Trust provider      | N/A               |
| Treasury access | On-chain rules  | Trust provider      | Public            |

## Threat Model

### Attacks We Prevent

| Attack                   | Prevention                  |
| ------------------------ | --------------------------- |
| Fake claims              | ZK proof verification       |
| Double claims            | Nullifier PDAs              |
| Amount manipulation      | ciphertext_hash in proof    |
| Wallet substitution      | payout_pubkey_hash in proof |
| On-chain amount snooping | Inco FHE encryption         |

### Attacks We Don't Prevent

| Attack             | Limitation                                                  |
| ------------------ | ----------------------------------------------------------- |
| Malicious admin    | Admin controls treasury and payrun creation                 |
| Service compromise | Payroll builder sees amounts during proof generation        |
| Email interception | Links could be intercepted (but can't claim without wallet) |
| Timing analysis    | Transaction timing visible on-chain                         |

## Recommendations

### For Organizations

1. **Self-host payroll builder** if highly sensitive
2. **Use secure email** for claim distribution
3. **Audit payrun CSV** before validation
4. **Monitor treasury** for unexpected transfers

### For Employees

1. **Keep claim links private** — treat like passwords
2. **Verify transaction details** before signing
3. **Use dedicated wallet** for receiving payments
4. **Check balance** after claiming (via Inco SDK)

## Future Improvements

| Improvement                      | Status     |
| -------------------------------- | ---------- |
| Client-side proof generation     | Planned    |
| Decentralized proof generation   | Research   |
| Alternative FHE networks         | Monitoring |
| End-to-end encrypted claim links | Planned    |
