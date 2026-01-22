-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgIdHex" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "treasuryConfAccount" TEXT NOT NULL,
    "zkVerifierProgramId" TEXT NOT NULL,
    "incoProgramId" TEXT NOT NULL,
    "settings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "claimerConfAccount" TEXT,
    "type" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT,
    "email" TEXT,
    "externalId" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Worker_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "schedule" TEXT NOT NULL DEFAULT 'MONTHLY',
    "rateAmount" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompPlan_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payrun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "payrunIdHex" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL DEFAULT 'BATCH',
    "merkleRootHex" TEXT,
    "totalPayslips" INTEGER NOT NULL DEFAULT 0,
    "paidCount" INTEGER NOT NULL DEFAULT 0,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" TEXT,
    "paidAmount" TEXT,
    "claimDeadline" DATETIME,
    "createdBy" TEXT NOT NULL,
    "executedBy" TEXT,
    "executedAt" DATETIME,
    "closedAt" DATETIME,
    "onChainTxSig" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payrun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrunId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "amountCommitmentHex" TEXT,
    "salaryCommitmentHex" TEXT,
    "ciphertextHashHex" TEXT,
    "employeeCommitmentHex" TEXT,
    "nullifierHex" TEXT,
    "encryptedAmountB64" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutTxSig" TEXT,
    "paidAt" DATETIME,
    "claimToken" TEXT,
    "claimTokenExpiresAt" DATETIME,
    "claimedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payslip_payrunId_fkey" FOREIGN KEY ("payrunId") REFERENCES "Payrun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payslip_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Paylink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "recipientWallet" TEXT,
    "recipientConfAccount" TEXT,
    "salaryCommitmentHex" TEXT,
    "ciphertextHashHex" TEXT,
    "encryptedAmountB64" TEXT,
    "nullifierHex" TEXT,
    "merkleRootHex" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "claimedBy" TEXT,
    "claimedAt" DATETIME,
    "payoutTxSig" TEXT,
    "memo" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Paylink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "payrunId" TEXT,
    "payslipId" TEXT,
    "paylinkId" TEXT,
    "type" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "txSig" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_payrunId_fkey" FOREIGN KEY ("payrunId") REFERENCES "Payrun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "actorWallet" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "response" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payruns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org_id" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "total_employees" INTEGER NOT NULL,
    "claim_deadline" INTEGER NOT NULL,
    "created_at" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "claim_packages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "org_id" TEXT NOT NULL,
    "payrun_id" TEXT NOT NULL,
    "leaf_index" INTEGER NOT NULL,
    "employee_secret" TEXT NOT NULL,
    "employee_commitment" TEXT NOT NULL,
    "salary_commitment" TEXT NOT NULL,
    "ciphertext_hash" TEXT NOT NULL,
    "nullifier" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "merkle_path" TEXT NOT NULL,
    "path_indices" TEXT NOT NULL,
    "employee_wallet" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "encrypted_amount" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Org_orgIdHex_key" ON "Org"("orgIdHex");

-- CreateIndex
CREATE INDEX "Org_ownerWallet_idx" ON "Org"("ownerWallet");

-- CreateIndex
CREATE INDEX "OrgMember_wallet_idx" ON "OrgMember"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_wallet_key" ON "OrgMember"("orgId", "wallet");

-- CreateIndex
CREATE INDEX "Worker_orgId_status_idx" ON "Worker"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_orgId_wallet_key" ON "Worker"("orgId", "wallet");

-- CreateIndex
CREATE INDEX "CompPlan_workerId_effectiveFrom_idx" ON "CompPlan"("workerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Payrun_payrunIdHex_key" ON "Payrun"("payrunIdHex");

-- CreateIndex
CREATE INDEX "Payrun_orgId_status_idx" ON "Payrun"("orgId", "status");

-- CreateIndex
CREATE INDEX "Payrun_orgId_createdAt_idx" ON "Payrun"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_claimToken_key" ON "Payslip"("claimToken");

-- CreateIndex
CREATE INDEX "Payslip_payrunId_status_idx" ON "Payslip"("payrunId", "status");

-- CreateIndex
CREATE INDEX "Payslip_workerId_idx" ON "Payslip"("workerId");

-- CreateIndex
CREATE INDEX "Payslip_claimToken_idx" ON "Payslip"("claimToken");

-- CreateIndex
CREATE UNIQUE INDEX "Paylink_token_key" ON "Paylink"("token");

-- CreateIndex
CREATE INDEX "Paylink_orgId_status_idx" ON "Paylink"("orgId", "status");

-- CreateIndex
CREATE INDEX "Paylink_token_idx" ON "Paylink"("token");

-- CreateIndex
CREATE INDEX "LedgerEntry_orgId_createdAt_idx" ON "LedgerEntry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_payrunId_idx" ON "LedgerEntry"("payrunId");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorWallet_idx" ON "AuditLog"("actorWallet");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE INDEX "idx_claim_packages_wallet" ON "claim_packages"("employee_wallet");

-- CreateIndex
CREATE INDEX "idx_claim_packages_payrun" ON "claim_packages"("payrun_id");

-- CreateIndex
CREATE UNIQUE INDEX "claim_packages_payrun_wallet" ON "claim_packages"("payrun_id", "employee_wallet");
