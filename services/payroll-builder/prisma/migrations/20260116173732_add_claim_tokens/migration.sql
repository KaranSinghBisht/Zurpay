-- CreateTable
CREATE TABLE "ClaimToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "payrunId" TEXT NOT NULL,
    "payslipId" TEXT,
    "paylinkId" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimToken_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClaimToken_paylinkId_fkey" FOREIGN KEY ("paylinkId") REFERENCES "Paylink" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimToken_tokenHash_key" ON "ClaimToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClaimToken_tokenHash_idx" ON "ClaimToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClaimToken_expiresAt_idx" ON "ClaimToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ClaimToken_payrunId_idx" ON "ClaimToken"("payrunId");
