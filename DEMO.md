# Zurpay Demo Guide

This guide provides a step-by-step walkthrough for judges to test the Zurpay confidential payroll system.

## Prerequisites

Before starting, ensure you have:

1. **Phantom Wallet** installed and configured for Solana Devnet
2. **Devnet SOL** in your wallet (get from [Solana Faucet](https://faucet.solana.com/))
3. **PostgreSQL** running locally (Docker is easiest)
4. Three terminal windows ready

---

## Setup (5-10 minutes)

### 1. Start PostgreSQL (Docker)

```bash
docker run --name zurpay-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=zurpay -p 5432:5432 -d postgres:15
```

### 2. Configure Payroll Builder

Create `services/payroll-builder/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zurpay?schema=public
PORT=3001
JWT_SECRET=change-me-please-use-32-chars-or-more
PAYROLL_ENCRYPTION_KEY=change-me-please-use-32-chars-or-more
SOLANA_RPC_URL=https://api.devnet.solana.com
ZURPAY_PROGRAM_ID=9ChoH5JKgaj1Stc1F1Se4dRVJvaKPkcRfHYMm1RWL2WG
USE_MOCK_PROVER=true
EMPLOYEE_APP_URL=http://localhost:3002
```

Run migrations:

```bash
cd services/payroll-builder
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

You should see:
```
Payroll builder service running on port 3001
```

### 3. Start Admin App

```bash
cd apps/admin
npm install
npm run dev
```

Opens on http://localhost:3000

### 4. Start Employee App

```bash
cd apps/employee
npm install
npm run dev
```

Opens on http://localhost:3002

---

## Demo Flow

### Part 1: Admin - Initialize Organization (2 minutes)

1. Open **http://localhost:3000/dashboard/settings** in your browser
2. Click **Connect Wallet** and then **Sign In** (message signature)
3. In the "Initialize Organization" form:
   - Click **Generate** to create an Org ID
   - Enter a Treasury Confidential Account address
   - Leave ZK Verifier and Inco Program IDs as defaults (or set your deployed IDs)
4. Click **Initialize Organization**
   - Approve the transaction in Phantom
   - Wait for confirmation

---

### Part 2: Admin - Add Workers (2 minutes)

1. Navigate to **http://localhost:3000/dashboard/workers**
2. Click **Add Worker**
3. Enter:
   - Worker wallet address
   - Confidential account (Inco) for payout destination
   - Optional: display name/email
   - Compensation amount (USDC)
4. Save the worker

> You need at least one worker with a confidential account and a compensation plan.

---

### Part 3: Admin - Create Payrun + Claim Links (3 minutes)

1. Navigate to **http://localhost:3000/dashboard/payruns/new**
2. Configure the payrun:
   - Keep **CLAIMS** mode
   - Set a claim deadline in the future
3. Select eligible workers and create the payrun
4. Open the newly created payrun detail page
5. Click **Validate & Generate Proofs**
   - Claim links appear under **Claim Links**
   - Copy one of the links (they are generated once)
6. Click **Post Payrun On-Chain** (required for on-chain claims)
7. Click **Open for Claims**

---

### Part 4: Employee - Claim Salary (2 minutes)

1. Open the copied claim link in a new browser tab or incognito window
2. Connect wallet
3. Click **Claim Salary**
4. Approve the transaction in Phantom
5. You should see **Claim Successful!** with a transaction signature

---

## Key Privacy Features to Demonstrate

1. **Token-Based Links**
   - Claim links use unguessable tokens, not wallet addresses
2. **Amount Privacy**
   - The UI never shows plaintext salary amounts
3. **ZK Proof Verification**
   - Claims include a ZK proof (mock or real verifier)
4. **One-Time Claims**
   - Tokens are single-use and expire

---

## Troubleshooting

### Payroll Builder Won't Start
- Ensure `DATABASE_URL`, `JWT_SECRET`, and `PAYROLL_ENCRYPTION_KEY` are set
- Verify Postgres is running on port 5432

### Claim Fails On-Chain
- Confirm `NEXT_PUBLIC_ZURPAY_PROGRAM_ID` matches your deployed program
- Confirm verifier and Inco program IDs are valid
- If `USE_MOCK_PROVER=true`, you need a verifier program that accepts mock proofs

### Init Org Fails (Invalid Verifier / Inco)
- The on-chain program enforces a whitelist of verifier + Inco program IDs
- Redeploy the program with updated IDs or set the settings form to IDs already whitelisted

### Connection / CORS Issues
- Ensure all three services are running
- Verify `ALLOWED_ORIGINS` in payroll-builder if running on different hosts

---

## Architecture Summary

```
Admin App (3000)          Payroll Builder (3001)      Employee App (3002)
     │                           │                          │
     │ ──── Create Payrun ─────► │                          │
     │                           │                          │
     │ ◄── Merkle + Tokens ───── │                          │
     │                           │                          │
     │ ──── Post Payrun ────────────────────────────────► │ (on-chain)
     │                           │                          │
     │ ─── Share claim link ─────│──────────────────────────│──►
     │                           │                          │
     │                           │ ◄── Fetch by token ───── │
     │                           │                          │
     │                           │ ──── Claim Package ────► │
     │                           │                          │
     │                           │                          │ ──► Claim TX (on-chain)
     │                           │                          │
     │                           │ ◄── Mark used ───────────│
```
