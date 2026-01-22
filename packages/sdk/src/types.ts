import { PublicKey } from '@solana/web3.js';

// Byte-oriented types intended for in-memory/on-chain use.
// For API transport, prefer the hex/base64 types in transport.ts.
export interface OrgConfig {
  orgId: Uint8Array;
  admin: PublicKey;
  treasuryConfAccount: PublicKey;
  zkVerifierProgramId: PublicKey;
  incoProgramId: PublicKey;
  payrunCounter: number;
  createdAt: number;
}

export interface Payrun {
  orgId: Uint8Array;
  payrunId: Uint8Array;
  merkleRoot: Uint8Array;
  totalEmployees: number;
  claimedCount: number;
  claimDeadline: number;
  createdAt: number;
  status: PayrunStatus;
}

export enum PayrunStatus {
  Active = 0,
  Completed = 1,
  Cancelled = 2,
}

export interface ClaimPackage {
  orgId: Uint8Array;
  payrunId: Uint8Array;
  leafIndex: number;
  employeeSecret: Uint8Array;
  employeeCommitment: Uint8Array;
  salaryCommitment: Uint8Array;
  ciphertextHash: Uint8Array;
  nullifier: Uint8Array;
  merkleRoot: Uint8Array;
  merklePath: Uint8Array[];
  pathIndices: boolean[];
  encryptedAmount: Uint8Array | null;
}

export interface ClaimPublicInputsV2 {
  merkleRoot: Uint8Array;
  nullifier: Uint8Array;
  payoutPubkeyHash: Uint8Array;
  orgId: Uint8Array;
  salaryCommitment: Uint8Array;
  ciphertextHash: Uint8Array;
}

export interface EmployeeEntry {
  employeeId: string;
  walletPubkey: string;
  amount: bigint;
}

export interface CreatePayrunRequest {
  orgId: Uint8Array;
  payrunId: Uint8Array;
  employees: EmployeeEntry[];
  claimDeadline: number;
}

export interface CreatePayrunResult {
  merkleRoot: Uint8Array;
  totalEmployees: number;
  claimPackages: Map<string, ClaimPackage>;
}

export interface EncryptedAmount {
  handle: Uint8Array;
  ciphertext: Uint8Array;
}

// ============================================================================
// V2 Types for Token-based Claims
// ============================================================================

/**
 * ClaimPackageV2 - Retrieved from payroll-builder via token.
 * Contains everything needed to submit an on-chain claim.
 * IMPORTANT: Does NOT contain employee_secret or plaintext salary.
 */
export interface ClaimPackageV2 {
  version: 'v2' | 'v3';
  orgIdHex: string; // 32 bytes hex
  payrunIdHex: string; // 32 bytes hex
  claimerConfAccount: string; // base58 pubkey
  treasuryConfAccount?: string; // base58 pubkey (optional for demo/UX)
  zkVerifierProgramId?: string; // base58 pubkey (optional)
  incoProgramId?: string; // base58 pubkey (optional)
  proofB64: string; // base64 proof bytes
  publicInputsB64: string; // base64 (exactly 192 bytes)
  encryptedAmountB64: string; // base64 ciphertext
  payoutPubkeyHashHex: string; // 32 bytes hex
  ciphertextHashHex: string; // 32 bytes hex
  nullifierHex: string; // 32 bytes hex
  salaryCommitmentHex: string; // 32 bytes hex
  merkleRootHex: string; // 32 bytes hex
}

/**
 * Claim accounts needed for the claim instruction
 */
export interface ClaimAccounts {
  org: PublicKey;
  payrun: PublicKey;
  treasuryConfAccount: PublicKey;
  claimerConfAccount: PublicKey;
  zkVerifierProgram: PublicKey;
  incoProgram: PublicKey;
}
