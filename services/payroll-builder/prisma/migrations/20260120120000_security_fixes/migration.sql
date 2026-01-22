-- AlterTable
ALTER TABLE "Paylink" ADD COLUMN "tokenCiphertext" TEXT;

-- AlterTable
ALTER TABLE "ClaimToken" ADD COLUMN "claimPackageJson" TEXT;

-- CreateTable
CREATE TABLE "SiwsNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SiwsNonce_nonce_key" ON "SiwsNonce"("nonce");

-- CreateIndex
CREATE INDEX "SiwsNonce_wallet_idx" ON "SiwsNonce"("wallet");

-- CreateIndex
CREATE INDEX "SiwsNonce_expiresAt_idx" ON "SiwsNonce"("expiresAt");
