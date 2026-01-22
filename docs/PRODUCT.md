# Zurpay Product Layer

This document describes the product layer built on top of the Zurpay hackathon MVP, transforming it from a proof-of-concept into a Payroll Operating System.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCT LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│  Admin App (Next.js)              Employee App (Next.js)            │
│  └─ Organizations                  └─ Claim Portal                   │
│  └─ Worker Management              └─ Paylink Claims                 │
│  └─ Payruns with Lifecycle         └─ Payslip History               │
│  └─ Paylinks                                                         │
│  └─ Exports & Audit                                                  │
│                    │                           │                     │
│                    ▼                           ▼                     │
│           ┌───────────────────────────────────────────┐             │
│           │     Payroll Builder Service (Express)     │             │
│           ├───────────────────────────────────────────┤             │
│           │  • Prisma + PostgreSQL (Product Database) │             │
│           │  • RBAC Middleware                        │             │
│           │  • Payrun State Machine                   │             │
│           │  • Idempotency Layer                      │             │
│           │  • Ledger & Audit Logs                    │             │
│           │  • Webhook Notifications                  │             │
│           └───────────────────────────────────────────┘             │
│                    │                                                 │
│                    ▼                                                 │
│           ┌───────────────────────────────────────────┐             │
│           │       On-Chain (Anchor Program)           │             │
│           │  • Org Config (treasury, verifier IDs)    │             │
│           │  • Payrun Merkle Roots                    │             │
│           │  • Nullifier Records                      │             │
│           │  • Inco Confidential Transfers            │             │
│           │  • Sunspot ZK Verification                │             │
│           └───────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Organizations

Organizations are the top-level entity. Each org has:

- Unique `orgIdHex` (matches on-chain)
- Owner wallet (admin)
- Treasury confidential account (Inco)
- ZK verifier program ID (Sunspot)
- Members with roles (OWNER, ADMIN, VIEWER, AUDITOR)

### Workers

Workers represent employees and contractors:

- Wallet address for identification
- Confidential account for payouts
- Type (EMPLOYEE / CONTRACTOR)
- Status (ACTIVE / INACTIVE)
- Compensation plans with schedules

### Payruns

Payruns follow a state machine:

```
DRAFT → READY → EXECUTING → COMPLETED
                    ↓
                 FAILED

DRAFT → READY → ACTIVE_CLAIMS → COMPLETED
```

**States:**
| Status | Description |
|--------|-------------|
| DRAFT | Created, payslips can be added/edited |
| READY | Validated with merkle root, awaiting execution |
| EXECUTING | Batch payouts in progress |
| ACTIVE_CLAIMS | Claim-based payrun open for claims |
| COMPLETED | All paid/claimed |
| FAILED | Execution failed |
| CLOSED | Manually closed |

**Modes:**

- **BATCH**: Admin-initiated push payroll (execute to pay all)
- **CLAIMS**: Employee-initiated pull claims (share links, employees claim)

### Payslips

Individual payment records within a payrun:

- Linked to worker
- Amount (stored privately)
- Cryptographic commitments (for ZK proofs)
- Status tracking (PENDING → PAID/CLAIMED/FAILED)
- Transaction signature reference

### Paylinks

Standalone one-time payment links:

- Not tied to payruns
- Claimable by anyone with the link (or restricted to specific wallet)
- Expiration date
- Single-use with nullifier tracking

### Ledger

Internal accounting trail:

- TREASURY_FUNDING: Funds added
- PAYROLL_ACCRUAL: Payrun created (liability)
- PAYOUT: Payment executed
- CLAIM: Employee claimed
- REVERSAL: Cancelled/failed reversed
- FEE: Platform fees
- ADJUSTMENT: Manual corrections

### Audit Logs

Every admin action is logged:

- Actor wallet
- Action type
- Entity reference
- Metadata
- Timestamp

## API Reference

### Organizations

```
POST   /api/v1/orgs                    Create organization
GET    /api/v1/orgs                    List my organizations
GET    /api/v1/orgs/:orgId             Get organization details
PATCH  /api/v1/orgs/:orgId             Update organization
POST   /api/v1/orgs/:orgId/members     Add member
PATCH  /api/v1/orgs/:orgId/members/:id Update member role
DELETE /api/v1/orgs/:orgId/members/:id Remove member
```

### Workers

```
GET    /api/v1/orgs/:orgId/workers              List workers
POST   /api/v1/orgs/:orgId/workers              Create worker
GET    /api/v1/orgs/:orgId/workers/:id          Get worker details
PATCH  /api/v1/orgs/:orgId/workers/:id          Update worker
POST   /api/v1/orgs/:orgId/workers/:id/comp-plans   Create comp plan
PATCH  /api/v1/orgs/:orgId/workers/:id/comp-plans/:planId   Update comp plan
```

### Payruns

```
GET    /api/v1/orgs/:orgId/payruns              List payruns
POST   /api/v1/orgs/:orgId/payruns              Create payrun from workers
GET    /api/v1/orgs/:orgId/payruns/:id          Get payrun details
POST   /api/v1/orgs/:orgId/payruns/:id/validate Validate (generate merkle root)
POST   /api/v1/orgs/:orgId/payruns/:id/execute  Execute batch payroll
POST   /api/v1/orgs/:orgId/payruns/:id/open-claims  Open for claims
POST   /api/v1/orgs/:orgId/payruns/:id/close    Close payrun
POST   /api/v1/orgs/:orgId/payruns/:id/cancel   Cancel payrun
```

### Paylinks

```
GET    /api/v1/orgs/:orgId/paylinks             List paylinks
POST   /api/v1/orgs/:orgId/paylinks             Create paylink
GET    /api/v1/orgs/:orgId/paylinks/:id         Get paylink details
POST   /api/v1/orgs/:orgId/paylinks/:id/cancel  Cancel paylink

# Public claim endpoints
GET    /api/v1/paylinks/:token/claim            Get claim info
POST   /api/v1/paylinks/:token/claim            Submit claim
```

### Exports

```
GET    /api/v1/orgs/:orgId/payruns/:id/export.csv       Download accounting CSV
GET    /api/v1/orgs/:orgId/payruns/:id/audit-pack.json  Download audit pack
GET    /api/v1/orgs/:orgId/ledger                       List ledger entries
GET    /api/v1/orgs/:orgId/audit-logs                   List audit logs
```

## Authentication

All authenticated endpoints require the `x-wallet-address` header with the caller's Solana wallet public key (base58).

Role-based access control:

- **OWNER**: Full access
- **ADMIN**: Can manage workers, payruns, paylinks
- **VIEWER**: Read-only access
- **AUDITOR**: Read access + exports

## Idempotency

The `execute` endpoint requires an `idempotencyKey` in the request body. This ensures:

- Double-clicking won't double-pay
- Retries are safe
- Consistent behavior on network failures

## Privacy Model

| Data              | Storage      | Visibility                     |
| ----------------- | ------------ | ------------------------------ |
| Salary amounts    | DB (private) | Admin only                     |
| Worker list       | DB (private) | Admin only                     |
| Merkle root       | On-chain     | Public (reveals nothing)       |
| Nullifiers        | On-chain     | Public (prevents double-claim) |
| Encrypted amounts | On-chain     | Inco-encrypted                 |

## Integration with On-Chain

The product layer orchestrates but doesn't replace on-chain:

1. **Create Payrun**: DB record created, payslips generated
2. **Validate Payrun**: Merkle tree built, commitments computed
3. **Set Payrun On-Chain**: Admin signs `set_payrun` instruction
4. **Execute (Batch)**: For each payslip, execute confidential transfer
5. **Claim (Pull)**: Employee submits ZK proof, program verifies and transfers

## Notifications

Optional webhook integration:

- Set `SLACK_WEBHOOK_URL` for Slack notifications
- Set `NOTIFICATION_WEBHOOK_URL` for custom webhooks

Events:

- PAYRUN_CREATED
- PAYRUN_VALIDATED
- PAYRUN_COMPLETED
- PAYRUN_FAILED
- PAYLINK_CREATED
- PAYLINK_CLAIMED
- WORKER_ADDED

## Database Schema

The product layer uses Prisma with PostgreSQL. Key tables:

- `Org` - Organizations
- `OrgMember` - Organization memberships
- `Worker` - Employees/contractors
- `CompPlan` - Compensation plans
- `Payrun` - Payroll runs
- `Payslip` - Individual payments
- `Paylink` - Standalone payment links
- `LedgerEntry` - Accounting trail
- `AuditLog` - Action history
- `IdempotencyKey` - Idempotency tracking

## Running the Product Layer

1. Install dependencies:

```bash
cd services/payroll-builder
npm install
```

2. Generate Prisma client:

```bash
npx prisma generate
npx prisma migrate dev
```

3. Start the service:

```bash
npm run dev
```

4. Start admin app:

```bash
cd apps/admin
npm run dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zurpay?schema=public"

# Server
PORT=3001

# Auth + Encryption
JWT_SECRET=your-secret-here-32-chars-min
PAYROLL_ENCRYPTION_KEY=your-secret-here-32-chars-min
SOLANA_RPC_URL=https://api.devnet.solana.com

# Prover Mode
USE_MOCK_PROVER=true

# Notifications (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
NOTIFICATION_WEBHOOK_URL=https://your-webhook.com/notify

# Employee App URL (for paylink URLs)
EMPLOYEE_APP_URL=http://localhost:3002

# Optional: legacy endpoints (not recommended)
# ENABLE_LEGACY_ENDPOINTS=true
```

## Security Considerations

1. **Verifier Program ID**: Stored per-org to allow upgrades while preventing arbitrary verifiers
2. **Treasury Validation**: Only the org's configured treasury can be source of funds
3. **Nullifier Domain Separation**: Includes org_id and payrun_id to prevent cross-org replay
4. **Destination Binding**: Proof binds to specific claimer account
5. **Ciphertext Binding**: Proof binds to specific encrypted amount
6. **Idempotency**: Prevents duplicate executions
7. **RBAC**: Role-based access on all admin endpoints
