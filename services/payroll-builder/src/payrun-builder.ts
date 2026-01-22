import { parse } from 'csv-parse/sync';
import {
  MerkleTree,
  computeLeafV2,
  computeEmployeeCommitment,
  computeSalaryCommitment,
  computeNullifier,
  generateSecret,
  generatePayrunId,
  bytesToHex,
  hexToBytes,
  parseAmount,
  computeCiphertextHash,
  computePayoutPubkeyHash,
} from '@zurpay/sdk';
import { PublicKey } from '@solana/web3.js';
import { encryptAmountForInco, hashToken } from './crypto';
import {
  CsvRow,
  CsvRowSchema,
  StoredClaimPackage,
  PayrunRecord,
  CreatePayrunRequestV2,
  ClaimPackageV2,
  ClaimLinkInfo,
} from './types';
import { tokenStore } from './token-store';
import { getProver, WitnessInputs } from './prover';
import { prisma } from './db';

// ============================================================================
// Legacy CSV-based payrun builder (kept for backwards compatibility)
// ============================================================================

export interface BuildPayrunInput {
  orgId: string;
  payrunId?: string;
  csvData: string;
  claimDeadline: number;
}

export interface BuildPayrunOutput {
  payrunRecord: PayrunRecord;
  claimPackages: StoredClaimPackage[];
}

export function buildPayrunFromCsv(input: BuildPayrunInput): BuildPayrunOutput {
  const { orgId, csvData, claimDeadline } = input;
  const orgIdBytes = hexToBytes(orgId);
  const payrunIdBytes = input.payrunId ? hexToBytes(input.payrunId) : generatePayrunId();
  const payrunIdHex = bytesToHex(payrunIdBytes);

  const records: CsvRow[] = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const validatedRecords = records.map((row) => CsvRowSchema.parse(row));

  const leaves: Uint8Array[] = [];
  const employeeData: Array<{
    wallet: string;
    amount: bigint;
    secret: Uint8Array;
    commitment: Uint8Array;
    salaryCommitment: Uint8Array;
    ciphertextHash: Uint8Array;
    nullifier: Uint8Array;
    encryptedAmount: Uint8Array;
  }> = [];

  for (const row of validatedRecords) {
    const secret = generateSecret();
    const amount = parseAmount(row.amount);
    const commitment = computeEmployeeCommitment(secret);
    const salaryCommitment = computeSalaryCommitment(amount, secret);

    const encryptedAmount = encryptAmountForInco(amount);
    const ciphertextHash = computeCiphertextHash(encryptedAmount);

    const payoutPubkeyHash = computePayoutPubkeyHash(new PublicKey(row.wallet));
    const leaf = computeLeafV2(
      payrunIdBytes,
      commitment,
      salaryCommitment,
      ciphertextHash,
      payoutPubkeyHash
    );
    const nullifier = computeNullifier(orgIdBytes, payrunIdBytes, secret);

    leaves.push(leaf);
    employeeData.push({
      wallet: row.wallet,
      amount,
      secret,
      commitment,
      salaryCommitment,
      ciphertextHash,
      nullifier,
      encryptedAmount,
    });
  }

  const tree = new MerkleTree(leaves);
  const merkleRoot = tree.root;

  const claimPackages: StoredClaimPackage[] = employeeData.map((data, index) => {
    const { path, indices } = tree.getProof(index);

    return {
      orgId,
      payrunId: payrunIdHex,
      leafIndex: index,
      employeeSecret: bytesToHex(data.secret),
      employeeCommitment: bytesToHex(data.commitment),
      salaryCommitment: bytesToHex(data.salaryCommitment),
      ciphertextHash: bytesToHex(data.ciphertextHash),
      nullifier: bytesToHex(data.nullifier),
      merkleRoot: bytesToHex(merkleRoot),
      merklePath: path.map(bytesToHex),
      pathIndices: indices,
      employeeWallet: data.wallet,
      amount: data.amount.toString(),
      encryptedAmount: bytesToHex(data.encryptedAmount),
    };
  });

  const payrunRecord: PayrunRecord = {
    id: payrunIdHex,
    orgId,
    merkleRoot: bytesToHex(merkleRoot),
    totalEmployees: validatedRecords.length,
    claimDeadline,
    createdAt: Date.now(),
  };

  return { payrunRecord, claimPackages };
}

// ============================================================================
// V2 Payrun Builder - Token-based with pre-generated proofs
// ============================================================================

export interface BuildPayrunV2Output {
  merkleRootHex: string;
  totalEmployees: number;
  claimLinks: ClaimLinkInfo[];
}

/**
 * Build a payrun from V2 request (with pre-computed commitments).
 * Generates proofs for each employee and stores claim packages with unguessable tokens.
 */
export async function buildPayrunV2(request: CreatePayrunRequestV2): Promise<BuildPayrunV2Output> {
  const { orgIdHex, payrunIdHex, claimDeadlineUnix, employees } = request;
  const orgIdBytes = hexToBytes(orgIdHex);
  const payrunIdBytes = hexToBytes(payrunIdHex);
  const org = await prisma.org.findUnique({ where: { orgIdHex } });

  const prover = getProver();

  // Build leaves for merkle tree
  const leaves: Uint8Array[] = [];
  const processedEmployees: Array<{
    employeeSecret: Uint8Array;
    employeeCommitment: Uint8Array;
    salaryCommitment: Uint8Array;
    ciphertextHash: Uint8Array;
    encryptedAmount: Uint8Array;
    claimerConfAccount: string;
    employeeWallet: string;
  }> = [];

  for (const emp of employees) {
    if (emp.employeeCommitmentHex && !emp.employeeSecretHex) {
      throw new Error('employeeSecretHex is required when employeeCommitmentHex is provided');
    }

    const employeeSecret = emp.employeeSecretHex ? hexToBytes(emp.employeeSecretHex) : generateSecret();
    const employeeCommitment = computeEmployeeCommitment(employeeSecret);
    if (emp.employeeCommitmentHex) {
      const expectedCommitment = hexToBytes(emp.employeeCommitmentHex);
      if (!Buffer.from(employeeCommitment).equals(Buffer.from(expectedCommitment))) {
        throw new Error('Employee commitment does not match employee secret');
      }
    }

    const salaryCommitment = hexToBytes(emp.salaryCommitmentHex);
    const encryptedAmount = Buffer.from(emp.encryptedAmountB64, 'base64');
    const ciphertextHash = computeCiphertextHash(encryptedAmount);
    const payoutPubkeyHash = computePayoutPubkeyHash(new PublicKey(emp.claimerConfAccount));

    const leaf = computeLeafV2(
      payrunIdBytes,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      payoutPubkeyHash
    );
    leaves.push(leaf);

    processedEmployees.push({
      employeeSecret,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      encryptedAmount,
      claimerConfAccount: emp.claimerConfAccount,
      employeeWallet: emp.employeeWallet,
    });
  }

  // Build merkle tree
  const tree = new MerkleTree(leaves);
  const merkleRoot = tree.root;
  const merkleRootHex = bytesToHex(merkleRoot);

  // Generate claim packages with proofs
  const claimLinks: ClaimLinkInfo[] = [];
  const claimTokenRows: Array<{
    tokenHash: string;
    payrunId: string;
    claimPackageJson: string;
    expiresAt: Date;
  }> = [];

  for (let i = 0; i < processedEmployees.length; i++) {
    const emp = processedEmployees[i];
    const { path, indices } = tree.getProof(i);

    // Compute payout pubkey hash from claimer conf account
    const claimerPubkey = new PublicKey(emp.claimerConfAccount);
    const payoutPubkeyHash = computePayoutPubkeyHash(claimerPubkey);

    const employeeSecret = emp.employeeSecret;

    // Compute nullifier
    const nullifier = computeNullifier(orgIdBytes, payrunIdBytes, employeeSecret);

    // Build witness inputs for the prover
    const witnessInputs: WitnessInputs = {
      merkle_root: Array.from(merkleRoot),
      nullifier: Array.from(nullifier),
      payout_pubkey_hash: Array.from(payoutPubkeyHash),
      org_id: Array.from(orgIdBytes),
      salary_commitment: Array.from(emp.salaryCommitment),
      ciphertext_hash: Array.from(emp.ciphertextHash),
      employee_secret: Array.from(employeeSecret),
      payrun_id: Array.from(payrunIdBytes),
      merkle_path: path.map((p) => Array.from(p)),
      path_indices: indices,
      payout_pubkey: Array.from(claimerPubkey.toBytes()),
    };

    // Generate proof
    const { proofBytes, publicInputsBytes } = await prover.proveClaimV2(witnessInputs);

    // Create claim package
    const claimPackage: ClaimPackageV2 = {
      version: 'v2',
      orgIdHex,
      payrunIdHex,
      claimerConfAccount: emp.claimerConfAccount,
      treasuryConfAccount: org?.treasuryConfAccount,
      zkVerifierProgramId: org?.zkVerifierProgramId,
      incoProgramId: org?.incoProgramId,
      proofB64: Buffer.from(proofBytes).toString('base64'),
      publicInputsB64: Buffer.from(publicInputsBytes).toString('base64'),
      encryptedAmountB64: Buffer.from(emp.encryptedAmount).toString('base64'),
      payoutPubkeyHashHex: bytesToHex(payoutPubkeyHash),
      ciphertextHashHex: bytesToHex(emp.ciphertextHash),
      nullifierHex: bytesToHex(nullifier),
      salaryCommitmentHex: bytesToHex(emp.salaryCommitment),
      merkleRootHex,
    };

    // Generate token (store after all proofs are ready to avoid partial state)
    const token = tokenStore.generateToken();

    claimLinks.push({
      claimerConfAccount: emp.claimerConfAccount,
      token,
      urlPath: `/claims/${payrunIdHex}?token=${token}`,
    });

    claimTokenRows.push({
      tokenHash: hashToken(token),
      payrunId: payrunIdHex,
      claimPackageJson: JSON.stringify(claimPackage),
      expiresAt: new Date(claimDeadlineUnix * 1000),
    });
  }

  if (claimTokenRows.length > 0) {
    await prisma.claimToken.createMany({
      data: claimTokenRows,
    });
  }

  return {
    merkleRootHex,
    totalEmployees: employees.length,
    claimLinks,
  };
}

/**
 * Get a claim package by token.
 */
export async function getClaimPackageByToken(token: string): Promise<any | null> {
  return tokenStore.getByToken(token);
}

/**
 * Mark a token as used after successful claim.
 */
export async function markTokenUsed(token: string): Promise<boolean> {
  return tokenStore.markUsed(token);
}

/**
 * Get token status for error messages.
 */
export async function getTokenStatus(token: string): Promise<{
  exists: boolean;
  used?: boolean;
  expired?: boolean;
}> {
  return tokenStore.getStatus(token);
}
