---
sidebar_position: 1
title: Architecture
---

# Architecture

Zurpay is a multi-component system for confidential payroll on Solana.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │  Admin Dashboard │              │ Employee Portal  │           │
│  │   (Next.js)     │              │   (Next.js)      │           │
│  │   Port 3000     │              │   Port 3002      │           │
│  └────────┬────────┘              └────────┬────────┘           │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Payroll Builder Service                  │   │
│  │                      (Express.js)                         │   │
│  │                       Port 3001                           │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │   │
│  │  │ Merkle Tree  │ │  ZK Prover   │ │ Token Store  │      │   │
│  │  │  Generator   │ │   (Noir)     │ │  (Postgres)  │      │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BLOCKCHAIN LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │   Zurpay     │ │   Sunspot    │ │    Inco      │             │
│  │   Program    │ │   Verifier   │ │   Lightning  │             │
│  │   (Anchor)   │ │   (Groth16)  │ │    (FHE)     │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                  │
│                    Solana Devnet                                │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Admin Dashboard (`apps/admin`)

Next.js application for organization administrators.

**Features:**

- Organization onboarding
- Treasury management
- Payrun creation and monitoring
- Worker management
- Schedule configuration
- Payment request approval

**Key Dependencies:**

- `@solana/web3.js` — Solana interactions
- `@solana/wallet-adapter-react` — Wallet connection
- `@inco/sdk` — Confidential transfers

### Employee Portal (`apps/employee`)

Next.js application for employees/contractors.

**Features:**

- Claim payments from payruns
- Create payment requests
- View confidential balance
- Initialize confidential accounts

### Payroll Builder Service (`services/payroll-builder`)

Express.js backend handling cryptographic operations.

**Responsibilities:**

- Merkle tree generation
- ZK proof generation (Noir circuits)
- Claim token management
- Database persistence

**Key Endpoints:**

- `POST /api/payruns/create` — Create payrun with claims
- `GET /api/v1/claims/:token` — Fetch claim package
- `POST /api/v1/claims/:token/mark-used` — Mark claim used

### Zurpay Program (`programs/zurpay_payroll`)

Anchor smart contract on Solana.

**Instructions:**

- `initialize_organization` — Create org treasury
- `create_payrun` — Post Merkle root
- `open_claims` — Enable claiming
- `claim_payment` — Verify proof and transfer

### Noir Circuit (`circuits/claim_eligibility`)

Zero-knowledge circuit for claim verification.

**Proves:**

- Claimer is in Merkle tree
- Nullifier is correctly derived
- Payout address matches
- Encrypted amount is committed

## Data Flow

### Payrun Creation

```
1. Admin uploads CSV
   │
   ▼
2. Payroll Builder generates Merkle tree
   │
   ▼
3. For each employee:
   ├─ Generate employee commitment
   ├─ Generate salary commitment
   ├─ Encrypt amount (Inco)
   ├─ Create Merkle leaf
   └─ Generate ZK proof
   │
   ▼
4. Store claim packages in database
   │
   ▼
5. Admin posts Merkle root on-chain
   │
   ▼
6. Admin opens claims
   │
   ▼
7. Employees receive claim links
```

### Claim Execution

```
1. Employee opens claim link
   │
   ▼
2. Fetch claim package (proof, encrypted amount)
   │
   ▼
3. Submit claim transaction:
   ├─ ZK proof
   ├─ Nullifier
   ├─ Encrypted amount
   └─ Recipient wallet
   │
   ▼
4. Zurpay program:
   ├─ Verify proof via Sunspot
   ├─ Check nullifier unused
   ├─ Store nullifier PDA
   └─ Execute Inco transfer
   │
   ▼
5. Employee receives encrypted tokens
```

## Security Model

### Trust Boundaries

| Component         | Trust Level   | Rationale                 |
| ----------------- | ------------- | ------------------------- |
| Solana Validators | Decentralized | Standard blockchain trust |
| Zurpay Program    | Verifiable    | Open source, auditable    |
| Sunspot Verifier  | Cryptographic | Math-based verification   |
| Inco Network      | Trusted       | FHE computation           |
| Payroll Builder   | Trusted       | Generates proofs          |

### Cryptographic Guarantees

| Property                | Mechanism                     |
| ----------------------- | ----------------------------- |
| Claim eligibility       | ZK proof of Merkle membership |
| Double-claim prevention | Nullifier PDAs                |
| Amount privacy          | Inco FHE encryption           |
| Wallet binding          | payout_pubkey_hash in proof   |

## Deployment

### Directory Structure

```
zurpay/
├── apps/
│   ├── admin/          # Next.js admin dashboard
│   ├── employee/       # Next.js employee portal
│   └── docs/           # Docusaurus documentation
├── services/
│   └── payroll-builder/  # Express.js backend
├── programs/
│   └── zurpay_payroll/   # Anchor program
├── circuits/
│   └── claim_eligibility/  # Noir ZK circuit
└── packages/
    └── sdk/              # Shared utilities
```

### Local Development

```bash
# Start all services
./dev.sh

# Or individually:
cd services/payroll-builder && npm run dev  # Port 3001
cd apps/admin && npm run dev                # Port 3000
cd apps/employee && npm run dev             # Port 3002
cd apps/docs && npm run start               # Port 3003
```

### Environment Configuration

See individual app `.env.example` files for required variables.
