# Zurpay

**Confidential payroll and contractor payouts on Solana — amounts encrypted by default, claims gated by ZK.**

Built for the Solana Privacy Hackathon 2026.

> 🎬 Demo video: coming soon

## The Problem

On-chain payroll today is "public payroll":

- Anyone can infer salaries, org burn rate, and pay schedules
- Employees can see who got how much (or correlate payments)
- Treasury visibility leaks runway and strategy

## The Solution

Zurpay makes payroll feel like a Stripe/Mercury console but:

- **Amounts stay private** using **Inco Lightning** (encrypted handles)
- **Claim eligibility is proven in ZK** using **Noir + Sunspot verifier** (Groth16 on Solana)

## Architecture

```mermaid
graph TB
    subgraph "Admin App"
        A1[Dashboard] --> A2[Create Payrun]
        A2 --> A3[Upload Workers CSV]
    end

    subgraph "Payroll Builder Service"
        PB1[Merkle Tree Generator]
        PB2[ZK Proof Generator]
        PB3[Token Store]
    end

    subgraph "Solana Blockchain"
        SC1[Zurpay Program]
        SC2[Sunspot Verifier]
        SC3[Inco Lightning]
        SC4[Nullifier PDAs]
    end

    subgraph "Employee App"
        E1[Claim Link] --> E2[Connect Wallet]
        E2 --> E3[Submit Claim TX]
    end

    A3 -->|Generate Merkle + Proofs| PB1
    PB1 --> PB2
    PB2 -->|Store claim packages| PB3
    A2 -->|Set payrun root| SC1

    E1 -->|Fetch claim package| PB3
    E3 -->|Verify proof| SC2
    SC2 -->|Transfer encrypted| SC3
    SC1 -->|Store nullifier| SC4

    style A1 fill:#10b981,stroke:#059669
    style E3 fill:#10b981,stroke:#059669
    style SC1 fill:#6366f1,stroke:#4f46e5
    style SC3 fill:#f59e0b,stroke:#d97706
```

### Directory Structure

```
zurpay/
├── apps/
│   ├── admin/          # Next.js admin dashboard
│   └── employee/       # Next.js employee claim portal
├── services/
│   └── payroll-builder/  # Merkle tree + ZK proof generation
├── programs/
│   └── zurpay_payroll/   # Anchor program (Solana)
├── circuits/
│   └── claim_eligibility/  # Noir circuit for ZK proofs
└── packages/
    └── sdk/              # Shared TypeScript utilities
```

## Tech Stack

| Component              | Technology              |
| ---------------------- | ----------------------- |
| Smart Contracts        | Anchor (Solana)         |
| ZK Proofs              | Noir + Sunspot verifier |
| Confidential Transfers | Inco Lightning          |
| RPC Provider           | Helius (recommended)    |
| Frontend               | Next.js 14 + Tailwind   |
| Merkle Trees           | SHA256 (matching Noir)  |

## Prerequisites

### Install Rust and Solana CLI

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/v1.18.20/install)"
```

### Install Anchor (via AVM)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest
avm use latest
anchor --version
```

### Install Noir

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
noirup
nargo --version
```

### Install Node.js dependencies

```bash
npm install
```

### Get a Helius API Key (Recommended)

For enhanced RPC reliability and privacy features, get a free Helius API key:

1. Sign up at [https://dev.helius.xyz](https://dev.helius.xyz)
2. Create a new project and copy your API key
3. Add it to your environment files (see Environment Variables section)

> **Why Helius?** Helius provides faster RPCs, better rate limits, and is a sponsor of the Solana Privacy Hackathon.

## Quick Start (Demo)

### 1. Build the SDK

```bash
cd packages/sdk && npm run build && cd ../..
```

### 2. Start PostgreSQL and Run Migrations

```bash
docker run --name zurpay-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zurpay -p 5432:5432 -d postgres:15
cd services/payroll-builder
npx prisma generate
npx prisma migrate dev
```

### 3. Start the Payroll Builder Service

```bash
cd services/payroll-builder && npm run dev
# Runs on http://localhost:3001
```

### 4. Start the Admin App

```bash
cd apps/admin && npm run dev
# Runs on http://localhost:3000
```

### 5. Start the Employee App

```bash
cd apps/employee && npm run dev
# Runs on http://localhost:3002
```

### 6. Follow the Demo Flow

See [DEMO.md](./DEMO.md) for the complete step-by-step demo walkthrough.

## Environment Variables

Copy the example env files and configure:

```bash
# Payroll Builder Service
cp services/payroll-builder/.env.example services/payroll-builder/.env

# Admin App
cp apps/admin/.env.example apps/admin/.env.local

# Employee App
cp apps/employee/.env.example apps/employee/.env.local
```

### Helius RPC Configuration (Recommended)

All services support Helius RPC for enhanced reliability. When `HELIUS_API_KEY` is set, the service automatically uses Helius devnet RPC.

| Service         | Environment Variable         |
| --------------- | ---------------------------- |
| Admin App       | `NEXT_PUBLIC_HELIUS_API_KEY` |
| Employee App    | `NEXT_PUBLIC_HELIUS_API_KEY` |
| Payroll Builder | `HELIUS_API_KEY`             |

### Admin App (`apps/admin/.env.local`)

```env
# Helius API Key (recommended) - get yours at https://dev.helius.xyz
NEXT_PUBLIC_HELIUS_API_KEY=your-helius-api-key

# Fallback RPC (used when Helius key is not set)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# Service URLs
NEXT_PUBLIC_PAYROLL_BUILDER_URL=http://localhost:3001
NEXT_PUBLIC_EMPLOYEE_APP_URL=http://localhost:3002

# Program IDs (Devnet)
NEXT_PUBLIC_ZURPAY_PROGRAM_ID=Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9
NEXT_PUBLIC_ZK_VERIFIER_PROGRAM_ID=4MZoLmEsXE1hx62GeSRABGzSGEv7isjck8h4rsnidFkU
NEXT_PUBLIC_INCO_PROGRAM_ID=5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj
```

### Employee App (`apps/employee/.env.local`)

```env
# Helius API Key (recommended)
NEXT_PUBLIC_HELIUS_API_KEY=your-helius-api-key

# Fallback RPC
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# Service URL
NEXT_PUBLIC_PAYROLL_BUILDER_URL=http://localhost:3001

# Program IDs (Devnet)
NEXT_PUBLIC_ZURPAY_PROGRAM_ID=Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9
NEXT_PUBLIC_ZK_VERIFIER_PROGRAM_ID=4MZoLmEsXE1hx62GeSRABGzSGEv7isjck8h4rsnidFkU
NEXT_PUBLIC_INCO_PROGRAM_ID=5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj
```

### Payroll Builder Service (`services/payroll-builder/.env`)

```env
# Helius API Key (recommended)
HELIUS_API_KEY=your-helius-api-key

# Fallback RPC
SOLANA_RPC_URL=https://api.devnet.solana.com

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zurpay?schema=public

# Server
PORT=3001
JWT_SECRET=change-me-please-use-32-chars-or-more
PAYROLL_ENCRYPTION_KEY=change-me-please-use-32-chars-or-more

# Prover
USE_MOCK_PROVER=true
# For real proofs: SUNSPOT_BIN=/path/to/sunspot
```

## How It Works

### For Admins

1. Initialize organization on-chain
2. Add workers with confidential accounts and compensation plans
3. Create a payrun (CLAIMS mode)
4. Validate payrun to generate Merkle root + ZK proofs
5. Post payrun root on-chain
6. Distribute claim links to employees

### For Employees

1. Open claim link (contains unguessable token)
2. Connect wallet
3. Submit claim transaction (proof is pre-generated)
4. Receive confidential tokens

## Privacy Guarantees

| What                    | Status                               |
| ----------------------- | ------------------------------------ |
| Salary amounts          | Encrypted (Inco handles)             |
| Employee list           | Hidden (only Merkle root on-chain)   |
| Double-claim prevention | Nullifier stored on-chain            |
| Claim destination       | Bound via payout_pubkey_hash         |
| Ciphertext binding      | Bound via ciphertext_hash in proof   |
| Claim links             | Unguessable tokens, not wallet-based |

## Public Inputs Schema (v2)

The ZK proof public inputs are 192 bytes:

| Field              | Offset | Size | Description                        |
| ------------------ | ------ | ---- | ---------------------------------- |
| merkle_root        | 0      | 32   | Merkle tree root of payrun         |
| nullifier          | 32     | 32   | Unique nullifier to prevent replay |
| payout_pubkey_hash | 64     | 32   | Hash of destination pubkey         |
| org_id             | 96     | 32   | Organization identifier            |
| salary_commitment  | 128    | 32   | Commitment to salary amount        |
| ciphertext_hash    | 160    | 32   | Hash of encrypted_amount           |

The ciphertext_hash binds the encrypted amount to the proof, preventing claimants from submitting arbitrary amounts.

## Merkle Leaf Structure (v2)

```
leaf = sha256(payrun_id || employee_commitment || salary_commitment || ciphertext_hash || payout_pubkey_hash)
```

## API Endpoints (Payroll Builder)

| Method | Endpoint                          | Description                                       |
| ------ | --------------------------------- | ------------------------------------------------- |
| POST   | `/api/payruns/create`             | Create payrun with tokenized claim links (legacy) |
| GET    | `/api/v1/claims/:token`           | Get claim package by token                        |
| POST   | `/api/v1/claims/:token/mark-used` | Mark token as used after claim                    |

## Run Tests

```bash
anchor test
```

## Deploy to Devnet

```bash
solana config set --url devnet
anchor deploy
```

## Devnet Notes

> **Important**: Inco Lightning is only available on Devnet. The confidential transfer functionality requires the Inco program to be deployed, which is currently devnet-only.

> **Also**: The on-chain program enforces a whitelist of verifier and Inco program IDs. If you change these IDs, redeploy the program or update the whitelist.

## License

MIT
