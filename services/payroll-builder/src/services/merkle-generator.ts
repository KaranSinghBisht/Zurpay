import { prisma } from '../db';
import { getProver, WitnessInputs } from '../prover';
import {
  MerkleTree,
  computeLeafV2,
  computeEmployeeCommitment,
  computeSalaryCommitment,
  computeNullifier,
  computeCiphertextHash,
  computePayoutPubkeyHash,
  generateSecret,
  bytesToHex,
  hexToBytes,
} from '@zurpay/sdk';
import { PublicKey } from '@solana/web3.js';
import { encryptAmountForInco, hashToken } from '../crypto';
import { randomBytes } from 'crypto';
import { ClaimPackageV2 } from '../types';
import logger from '../logger';

export interface ScheduledClaim {
  email: string;
  amount: string;
}

export interface MerkleTreeResult {
  merkleRoot: string;
  totalClaims: number;
}

export interface GenerateMerkleTreeForScheduleResult {
  merkleRoot: string;
  merkleRootBytes: Uint8Array;
  totalClaims: number;
  claimTokens: string[];
}

export async function generateMerkleTreeForSchedule(
  orgIdHex: string,
  payrunIdHex: string,
  workerIds: string[],
  claimDeadlineDays: number
): Promise<GenerateMerkleTreeForScheduleResult> {
  const org = await prisma.org.findUnique({
    where: { orgIdHex },
  });

  if (!org) {
    throw new Error(`Organization not found: ${orgIdHex}`);
  }

  const workers =
    workerIds.length > 0
      ? await prisma.worker.findMany({
          where: {
            id: { in: workerIds },
            orgId: org.id,
            status: 'ACTIVE',
          },
          include: {
            compPlans: {
              where: { effectiveTo: null },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        })
      : await prisma.worker.findMany({
          where: {
            orgId: org.id,
            status: 'ACTIVE',
          },
          include: {
            compPlans: {
              where: { effectiveTo: null },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        });

  const eligibleWorkers = workers.filter((w) => w.compPlans.length > 0 && w.claimerConfAccount);

  if (eligibleWorkers.length === 0) {
    throw new Error('No eligible workers found for scheduled payrun');
  }

  logger.info(
    { orgIdHex, payrunIdHex, workerCount: eligibleWorkers.length },
    'Generating merkle tree for scheduled payrun'
  );

  const orgIdBytes = hexToBytes(orgIdHex);
  const payrunIdBytes = hexToBytes(payrunIdHex);
  const prover = getProver();

  const leaves: Uint8Array[] = [];
  const workerData: Array<{
    workerId: string;
    claimerConfAccount: string;
    amount: bigint;
    employeeSecret: Uint8Array;
    employeeCommitment: Uint8Array;
    salaryCommitment: Uint8Array;
    ciphertextHash: Uint8Array;
    encryptedAmount: Uint8Array;
    nullifier: Uint8Array;
    payoutPubkeyHash: Uint8Array;
  }> = [];

  for (const worker of eligibleWorkers) {
    const amount = BigInt(worker.compPlans[0].rateAmount);
    const claimerConfAccount = worker.claimerConfAccount!;

    const employeeSecret = generateSecret();
    const employeeCommitment = computeEmployeeCommitment(employeeSecret);
    const salaryCommitment = computeSalaryCommitment(amount, employeeSecret);
    const encryptedAmount = await encryptAmountForInco(amount);
    const ciphertextHash = computeCiphertextHash(encryptedAmount);
    const payoutPubkeyHash = computePayoutPubkeyHash(new PublicKey(claimerConfAccount));
    const nullifier = computeNullifier(orgIdBytes, payrunIdBytes, employeeSecret);

    const leaf = computeLeafV2(
      payrunIdBytes,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      payoutPubkeyHash
    );

    leaves.push(leaf);
    workerData.push({
      workerId: worker.id,
      claimerConfAccount,
      amount,
      employeeSecret,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      encryptedAmount,
      nullifier,
      payoutPubkeyHash,
    });
  }

  const tree = new MerkleTree(leaves);
  const merkleRoot = tree.root;
  const merkleRootHex = bytesToHex(merkleRoot);

  logger.info({ merkleRootHex, totalClaims: workerData.length }, 'Merkle tree built');

  const claimTokens: string[] = [];
  const claimTokenRows: Array<{
    tokenHash: string;
    payrunId: string;
    claimPackageJson: string;
    expiresAt: Date;
  }> = [];

  const claimDeadline = new Date(Date.now() + claimDeadlineDays * 24 * 60 * 60 * 1000);

  for (let i = 0; i < workerData.length; i++) {
    const data = workerData[i];
    const { path, indices } = tree.getProof(i);
    const claimerPubkey = new PublicKey(data.claimerConfAccount);

    const witnessInputs: WitnessInputs = {
      merkle_root: Array.from(merkleRoot),
      nullifier: Array.from(data.nullifier),
      payout_pubkey_hash: Array.from(data.payoutPubkeyHash),
      org_id: Array.from(orgIdBytes),
      salary_commitment: Array.from(data.salaryCommitment),
      ciphertext_hash: Array.from(data.ciphertextHash),
      employee_secret: Array.from(data.employeeSecret),
      payrun_id: Array.from(payrunIdBytes),
      merkle_path: path.map((p) => Array.from(p)),
      path_indices: indices,
      payout_pubkey: Array.from(claimerPubkey.toBytes()),
    };

    const { proofBytes, publicInputsBytes } = await prover.proveClaimV2(witnessInputs);

    const claimPackage: ClaimPackageV2 = {
      version: 'v2',
      orgIdHex,
      payrunIdHex,
      claimerConfAccount: data.claimerConfAccount,
      treasuryConfAccount: org.treasuryConfAccount,
      zkVerifierProgramId: org.zkVerifierProgramId,
      incoProgramId: org.incoProgramId,
      proofB64: Buffer.from(proofBytes).toString('base64'),
      publicInputsB64: Buffer.from(publicInputsBytes).toString('base64'),
      encryptedAmountB64: Buffer.from(data.encryptedAmount).toString('base64'),
      payoutPubkeyHashHex: bytesToHex(data.payoutPubkeyHash),
      ciphertextHashHex: bytesToHex(data.ciphertextHash),
      nullifierHex: bytesToHex(data.nullifier),
      salaryCommitmentHex: bytesToHex(data.salaryCommitment),
      merkleRootHex,
    };

    const token = randomBytes(32).toString('base64url');
    claimTokens.push(token);

    claimTokenRows.push({
      tokenHash: hashToken(token),
      payrunId: payrunIdHex,
      claimPackageJson: JSON.stringify(claimPackage),
      expiresAt: claimDeadline,
    });
  }

  if (claimTokenRows.length > 0) {
    await prisma.claimToken.createMany({
      data: claimTokenRows,
    });
  }

  logger.info(
    {
      merkleRootHex,
      totalClaims: workerData.length,
      claimTokensGenerated: claimTokenRows.length,
    },
    'Merkle tree generation complete'
  );

  return {
    merkleRoot: merkleRootHex,
    merkleRootBytes: merkleRoot,
    totalClaims: workerData.length,
    claimTokens,
  };
}
