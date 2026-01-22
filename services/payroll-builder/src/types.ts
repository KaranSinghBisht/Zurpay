import { z } from 'zod';

// ============================================================================
// Legacy CSV-based types (kept for backwards compatibility)
// ============================================================================

export const CsvRowSchema = z.object({
  employee_id: z.string(),
  wallet: z.string(),
  amount: z.string(),
});

export type CsvRow = z.infer<typeof CsvRowSchema>;

export const CreatePayrunRequestSchema = z.object({
  orgId: z.string(),
  payrunId: z.string().optional(),
  claimDeadline: z.number(),
});

export type CreatePayrunRequestBody = z.infer<typeof CreatePayrunRequestSchema>;

export interface StoredClaimPackage {
  orgId: string;
  payrunId: string;
  leafIndex: number;
  employeeSecret: string;
  employeeCommitment: string;
  salaryCommitment: string;
  ciphertextHash: string;
  nullifier: string;
  merkleRoot: string;
  merklePath: string[];
  pathIndices: boolean[];
  employeeWallet: string;
  amount: string;
  encryptedAmount: string;
}

export interface PayrunRecord {
  id: string;
  orgId: string;
  merkleRoot: string;
  totalEmployees: number;
  claimDeadline: number;
  createdAt: number;
}

// ============================================================================
// V2 API Types - Token-based with pre-generated proofs
// ============================================================================

/**
 * ClaimPackageV2 - Returned via token endpoint.
 * Contains everything needed to submit an on-chain claim.
 * IMPORTANT: Does NOT contain employee_secret or plaintext salary.
 */
export interface ClaimPackageV2 {
  version: 'v2';
  orgIdHex: string;              // 32 bytes hex
  payrunIdHex: string;           // 32 bytes hex
  claimerConfAccount: string;    // base58 pubkey
  treasuryConfAccount?: string;  // base58 pubkey (optional for demo/UX)
  zkVerifierProgramId?: string;  // base58 pubkey (optional)
  incoProgramId?: string;        // base58 pubkey (optional)
  proofB64: string;              // base64 proof bytes
  publicInputsB64: string;       // base64 (exactly 192 bytes)
  encryptedAmountB64: string;    // base64 ciphertext
  payoutPubkeyHashHex: string;   // 32 bytes hex
  ciphertextHashHex: string;     // 32 bytes hex
  nullifierHex: string;          // 32 bytes hex
  salaryCommitmentHex: string;   // 32 bytes hex
  merkleRootHex: string;         // 32 bytes hex
}

/**
 * Employee entry in CreatePayrunRequestV2.
 * If employeeSecretHex is omitted, the server will generate a secret for proofs.
 * If employeeCommitmentHex is provided, employeeSecretHex must be provided as well.
 */
export interface EmployeeEntryV2 {
  employeeWallet: string;           // base58 - for record keeping only
  claimerConfAccount: string;       // base58 - the payout confidential account pubkey
  employeeSecretHex?: string;       // 32 bytes hex (optional override)
  employeeCommitmentHex?: string;   // 32 bytes hex (optional verification)
  salaryCommitmentHex: string;      // 32 bytes hex
  encryptedAmountB64: string;       // ciphertext bytes, base64
}

/**
 * Request body for POST /api/payruns/create
 */
export interface CreatePayrunRequestV2 {
  orgIdHex: string;              // 32 bytes hex
  payrunIdHex: string;           // 32 bytes hex
  claimDeadlineUnix: number;     // Unix timestamp
  employees: EmployeeEntryV2[];
}

export const CreatePayrunRequestV2Schema = z.object({
  orgIdHex: z.string().length(64),
  payrunIdHex: z.string().length(64),
  claimDeadlineUnix: z.number(),
  employees: z.array(z.object({
    employeeWallet: z.string(),
    claimerConfAccount: z.string(),
    employeeSecretHex: z.string().length(64).optional(),
    employeeCommitmentHex: z.string().length(64).optional(),
    salaryCommitmentHex: z.string().length(64),
    encryptedAmountB64: z.string(),
  })),
});

/**
 * Claim link returned in response
 */
export interface ClaimLinkInfo {
  claimerConfAccount: string;
  token: string;
  urlPath: string;  // e.g. /claims/{payrunId}?token=...
}

/**
 * Response for POST /api/payruns/create
 */
export interface CreatePayrunResponseV2 {
  merkleRootHex: string;
  totalEmployees: number;
  claimLinks: ClaimLinkInfo[];
}

/**
 * Token store entry - internal use only
 */
export interface TokenStoreEntry {
  claimPackage: ClaimPackageV2;
  expiresAtUnix: number;
  used: boolean;
  createdAtUnix: number;
}
