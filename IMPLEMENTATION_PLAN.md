# Zurpay Implementation Plan - Solana Privacy Hackathon

## Target Prizes

1. **Inco - Best Confidential Apps (Payments)**: $2k
2. **Aztec - ZK with Noir (Best Overall)**: $5k
3. **Helius - Best Privacy Project**: TBD

---

## Phase 1: Infrastructure & Integrations (MUST HAVE)

### 1.1 Helius RPC Integration

**Commit**: `feat(infra): integrate Helius RPC for enhanced privacy`

- [ ] Add `HELIUS_API_KEY` env var support
- [ ] Replace public devnet RPC with Helius RPC in all apps
- [ ] Add Helius webhook for transaction notifications
- [ ] Update README with Helius setup instructions

**Files to modify**:

- `apps/admin/.env.example`
- `apps/employee/.env.example`
- `services/payroll-builder/.env.example`
- `packages/sdk/src/constants.ts`
- All Solana connection initializations

---

### 1.2 Real Token Support (USDC)

**Commit**: `feat(treasury): add USDC token account support`

- [ ] Add SPL token mint configuration
- [ ] Create/link USDC token accounts for treasury
- [ ] Display real USDC balance in treasury dashboard
- [ ] Add token transfer instructions to claim flow

**Files to modify**:

- `programs/zurpay_payroll/src/instructions/claim.rs`
- `apps/admin/src/app/(dashboard)/dashboard/treasury/page.tsx`
- `packages/sdk/src/claim.ts`

---

## Phase 2: Enhanced ZK Features (Noir/Aztec Differentiator)

### 2.1 Salary Range Proof Circuit

**Commit**: `feat(zk): add salary range proof circuit for income verification`

**Purpose**: Allow employees to prove "I earn > $X" without revealing exact salary.

**New circuit** (`circuits/salary_range/src/main.nr`):

```noir
fn main(
    salary_commitment: pub Field,
    threshold: pub Field,
    salary: Field,
    salt: Field
) {
    // Prove commitment matches
    let computed = poseidon([salary, salt]);
    assert(computed == salary_commitment);

    // Prove salary >= threshold (without revealing salary)
    assert(salary >= threshold);
}
```

**Use cases**:

- Third-party loan applications
- Premium service access
- Credit scoring without revealing salary

---

### 2.2 Employment Verification Proof

**Commit**: `feat(zk): add employment verification proof`

**Purpose**: Prove "I am employed by org X" without revealing salary or position.

**New circuit** (`circuits/employment_proof/src/main.nr`):

```noir
fn main(
    org_id: pub Field,
    current_timestamp: pub Field,
    employee_commitment: Field,
    merkle_root: Field,
    merkle_path: [[u8; 32]; 20],
    path_indices: [bool; 20]
) {
    // Prove employee is in org's merkle tree
    // Without revealing which leaf (privacy)
}
```

---

### 2.3 zkKYC/Identity Verification (zkPassport-style)

**Commit**: `feat(zk): add zkKYC identity verification for worker onboarding`

**Purpose**: Verify worker identity without storing PII on-chain.

**Features**:

- Age verification (prove > 18 without revealing DOB)
- Nationality/region verification for compliance
- Human verification (anti-sybil)

**Implementation approach**:

- Store hash(identity_document) as commitment
- Circuit proves document validity + age threshold
- No PII ever touches blockchain

---

## Phase 3: DAO/Startup Production Features

### 3.1 Multi-sig Payrun Approval Flow

**Commit**: `feat(multisig): add payrun approval through Squads multisig`

- [ ] Wire Treasury multisig to payrun creation
- [ ] Add "Propose Payrun" action (creates Squads proposal)
- [ ] Add approval voting UI
- [ ] Execute payrun only after threshold met
- [ ] Display pending approvals on dashboard

**Flow**:

```
Admin creates payrun (DRAFT)
    → Propose to multisig
    → Signers vote (PENDING_APPROVAL)
    → Threshold met → Auto-validate & post on-chain (READY)
    → Open for claims (ACTIVE_CLAIMS)
```

---

### 3.2 Worker Self-Registration Portal

**Commit**: `feat(workers): add self-registration portal with zkKYC`

- [ ] Public registration page `/register`
- [ ] Wallet connection + message signing
- [ ] Optional zkKYC verification
- [ ] Admin approval workflow
- [ ] Email notification on approval

---

### 3.3 Inco Balance Decryption UI

**Commit**: `feat(inco): add encrypted balance viewing for employees`

- [ ] Integrate Inco decryption SDK
- [ ] "View My Balance" button on employee dashboard
- [ ] Show decrypted balance after claim
- [ ] Privacy indicator (encrypted vs decrypted state)

---

### 3.4 Notification System

**Commit**: `feat(notifications): add email/wallet notifications`

- [ ] Email when paylink is ready (via SendGrid/Resend)
- [ ] Wallet notification via Dialect/Helius
- [ ] Claim deadline reminders
- [ ] Admin alerts for pending approvals

---

## Phase 4: Analytics & Reporting

### 4.1 Privacy-Preserving Analytics Dashboard

**Commit**: `feat(analytics): add privacy-preserving org analytics`

**Display without revealing individual salaries**:

- Total payroll distributed (aggregate)
- Number of employees paid
- Claim rate percentage
- Average time to claim
- Payrun success rate

---

### 4.2 Compliance Export

**Commit**: `feat(compliance): add export reports for accounting`

- [ ] CSV export of payrun summaries
- [ ] PDF reports with aggregate totals
- [ ] Audit log export
- [ ] Tax reporting helper (totals only)

---

## Phase 5: Polish & Documentation

### 5.1 Technical Documentation

**Commit**: `docs: add technical architecture documentation`

- [ ] ZK circuit explanation with diagrams
- [ ] Privacy model documentation
- [ ] Inco integration guide
- [ ] API reference

---

### 5.2 Demo Video Script

**Commit**: `docs: add demo video script and assets`

**Video outline** (3 min):

1. Problem statement (30s)
2. Admin flow: Create org → Add workers → Create payrun (60s)
3. Privacy highlight: Show encrypted amounts on-chain (30s)
4. Employee claim flow (45s)
5. ZK proof verification highlight (15s)

---

## Implementation Order (Recommended)

| #   | Task                          | Time Est. | Commit Prefix     |
| --- | ----------------------------- | --------- | ----------------- |
| 1   | Helius RPC Integration        | 1-2h      | `feat(infra)`     |
| 2   | Multi-sig Payrun Approval     | 4-6h      | `feat(multisig)`  |
| 3   | Salary Range Proof Circuit    | 3-4h      | `feat(zk)`        |
| 4   | Inco Balance Decryption       | 2-3h      | `feat(inco)`      |
| 5   | Real USDC Token Support       | 3-4h      | `feat(treasury)`  |
| 6   | Employment Verification Proof | 2-3h      | `feat(zk)`        |
| 7   | zkKYC Worker Onboarding       | 4-6h      | `feat(zk)`        |
| 8   | Privacy Analytics Dashboard   | 2-3h      | `feat(analytics)` |
| 9   | Technical Documentation       | 2-3h      | `docs`            |
| 10  | Demo Video                    | 2-3h      | `docs`            |

---

## Deployed Addresses (Devnet)

| Component        | Address                                        |
| ---------------- | ---------------------------------------------- |
| Zurpay Program   | `Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9` |
| ZK Verifier (V4) | `4MZoLmEsXE1hx62GeSRABGzSGEv7isjck8h4rsnidFkU` |
| Inco Lightning   | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` |

---

## Prize Alignment

### Inco (Payments) ✓

- [x] FHE-encrypted salary amounts
- [x] Confidential transfers via Inco CPIs
- [ ] Balance decryption demo
- [ ] Multi-org treasury support

### Aztec/Noir (ZK) ✓

- [x] Claim eligibility circuit
- [x] Merkle proof verification
- [x] V4 compact proof format (44 bytes)
- [ ] Salary range proofs
- [ ] Employment verification
- [ ] zkKYC integration

### Helius

- [ ] Helius RPC integration
- [ ] Transaction webhooks
- [ ] Enhanced indexing

---

## Next Steps

Ready to start with **Task #1: Helius RPC Integration**?

This is the quickest win and checks off the Helius prize requirement.
