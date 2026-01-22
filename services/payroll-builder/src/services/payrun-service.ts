import { prisma } from '../db';
import {
  PayrunStatus,
  PayrunMode,
  PayslipStatus,
  LedgerEntryType,
  WorkerStatus,
} from '../generated/prisma';
import { createAuditLog, AuditActions } from './audit';
import { withIdempotency } from './idempotency';
import {
  createBatches,
  executeBatchWithRetry,
  summarizeBatchExecution,
  BatchExecutionResult,
} from './batch';
import { getProver, WitnessInputs } from '../prover';
import { ClaimLinkInfo, ClaimPackageV2 } from '../types';
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
import { randomBytes } from 'crypto';
import { encryptAmountForInco, hashToken } from '../crypto';

export interface CreatePayrunFromWorkersParams {
  orgId: string;
  actorWallet: string;
  periodStart?: Date;
  periodEnd?: Date;
  mode: PayrunMode;
  claimDeadline?: Date;
  workerIds?: string[];
  notes?: string;
}

export interface CreatePayrunResult {
  payrunId: string;
  payrunIdHex: string;
  totalPayslips: number;
  totalAmount: string;
}

function generatePayrunIdHex(): string {
  return bytesToHex(randomBytes(32));
}

export async function createPayrunFromWorkers(
  params: CreatePayrunFromWorkersParams
): Promise<CreatePayrunResult> {
  const { orgId, actorWallet, periodStart, periodEnd, mode, claimDeadline, workerIds, notes } =
    params;

  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found');

  const workersQuery = {
    orgId,
    status: WorkerStatus.ACTIVE,
    ...(workerIds && workerIds.length > 0 && { id: { in: workerIds } }),
  };

  const workers = await prisma.worker.findMany({
    where: workersQuery,
    include: {
      compPlans: {
        where: { effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' as const },
        take: 1,
      },
    },
  });

  const workersWithComp = workers.filter((w) => w.compPlans.length > 0 && w.claimerConfAccount);

  if (workersWithComp.length === 0) {
    throw new Error('No eligible workers with compensation plans and confidential accounts');
  }

  const payrunIdHex = generatePayrunIdHex();

  let totalAmount = 0n;
  const payslipData: Array<{
    workerId: string;
    amount: string;
    currency: string;
  }> = [];

  for (const worker of workersWithComp) {
    const comp = worker.compPlans[0];
    totalAmount += BigInt(comp.rateAmount);
    payslipData.push({
      workerId: worker.id,
      amount: comp.rateAmount,
      currency: comp.currency,
    });
  }

  const payrun = await prisma.payrun.create({
    data: {
      orgId,
      payrunIdHex,
      periodStart,
      periodEnd,
      status: PayrunStatus.DRAFT,
      mode,
      totalPayslips: payslipData.length,
      totalAmount: totalAmount.toString(),
      claimDeadline,
      createdBy: actorWallet,
      notes,
      payslips: {
        create: payslipData.map((p) => ({
          workerId: p.workerId,
          amount: p.amount,
          currency: p.currency,
          status: PayslipStatus.PENDING,
        })),
      },
    },
    include: {
      payslips: true,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      orgId,
      payrunId: payrun.id,
      type: LedgerEntryType.PAYROLL_ACCRUAL,
      amount: totalAmount.toString(),
      currency: 'USDC',
      description: `Payroll accrual for payrun ${payrunIdHex.slice(0, 16)}...`,
    },
  });

  await createAuditLog({
    orgId,
    actorWallet,
    action: AuditActions.CREATE_PAYRUN,
    entityType: 'Payrun',
    entityId: payrun.id,
    metadata: {
      payrunIdHex,
      totalPayslips: payslipData.length,
      totalAmount: totalAmount.toString(),
      mode,
    },
  });

  return {
    payrunId: payrun.id,
    payrunIdHex,
    totalPayslips: payslipData.length,
    totalAmount: totalAmount.toString(),
  };
}

export async function validatePayrun(
  payrunId: string,
  actorWallet: string
): Promise<{ merkleRootHex: string; claimLinks: ClaimLinkInfo[] }> {
  const payrun = await prisma.payrun.findUnique({
    where: { id: payrunId },
    include: {
      payslips: {
        include: {
          worker: true,
        },
      },
      org: true,
    },
  });

  if (!payrun) throw new Error('Payrun not found');
  if (payrun.status !== PayrunStatus.DRAFT) {
    throw new Error(`Cannot validate payrun in ${payrun.status} status`);
  }

  const orgIdBytes = hexToBytes(payrun.org.orgIdHex);
  const payrunIdBytes = hexToBytes(payrun.payrunIdHex);

  const prover = getProver();
  const leaves: Uint8Array[] = [];
  const payslipUpdates: Array<{
    id: string;
    claimerConfAccount: string;
    employeeSecret: Uint8Array;
    employeeCommitmentHex: string;
    salaryCommitment: Uint8Array;
    salaryCommitmentHex: string;
    ciphertextHash: Uint8Array;
    ciphertextHashHex: string;
    encryptedAmount: Uint8Array;
    encryptedAmountB64: string;
    nullifier: Uint8Array;
    nullifierHex: string;
    payoutPubkeyHash: Uint8Array;
    claimTokenExpiresAt: Date;
  }> = [];

  for (const payslip of payrun.payslips) {
    if (!payslip.worker.claimerConfAccount) {
      throw new Error(`Worker ${payslip.worker.id} missing confidential account`);
    }

    const employeeSecret = generateSecret();
    const employeeCommitment = computeEmployeeCommitment(employeeSecret);
    const salaryCommitment = computeSalaryCommitment(BigInt(payslip.amount), employeeSecret);
    const encryptedAmount = encryptAmountForInco(BigInt(payslip.amount));
    const ciphertextHash = computeCiphertextHash(encryptedAmount);
    const nullifier = computeNullifier(orgIdBytes, payrunIdBytes, employeeSecret);
    const payoutPubkeyHash = computePayoutPubkeyHash(
      new PublicKey(payslip.worker.claimerConfAccount)
    );

    const leaf = computeLeafV2(
      payrunIdBytes,
      employeeCommitment,
      salaryCommitment,
      ciphertextHash,
      payoutPubkeyHash
    );
    leaves.push(leaf);

    const claimTokenExpiresAt =
      payrun.claimDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    payslipUpdates.push({
      id: payslip.id,
      claimerConfAccount: payslip.worker.claimerConfAccount,
      employeeSecret,
      employeeCommitmentHex: bytesToHex(employeeCommitment),
      salaryCommitment,
      salaryCommitmentHex: bytesToHex(salaryCommitment),
      ciphertextHash,
      ciphertextHashHex: bytesToHex(ciphertextHash),
      encryptedAmount,
      encryptedAmountB64: Buffer.from(encryptedAmount).toString('base64'),
      nullifier,
      nullifierHex: bytesToHex(nullifier),
      payoutPubkeyHash,
      claimTokenExpiresAt,
    });
  }

  const tree = new MerkleTree(leaves);
  const merkleRootHex = bytesToHex(tree.root);

  const claimLinks: ClaimLinkInfo[] = [];
  const claimTokenRows: Array<{
    tokenHash: string;
    payrunId: string;
    payslipId: string;
    claimPackageJson: string;
    expiresAt: Date;
  }> = [];

  for (let i = 0; i < payslipUpdates.length; i++) {
    const update = payslipUpdates[i];
    const { path, indices } = tree.getProof(i);

    const claimerPubkey = new PublicKey(update.claimerConfAccount);

    const witnessInputs: WitnessInputs = {
      merkle_root: Array.from(tree.root),
      nullifier: Array.from(update.nullifier),
      payout_pubkey_hash: Array.from(update.payoutPubkeyHash),
      org_id: Array.from(orgIdBytes),
      salary_commitment: Array.from(update.salaryCommitment),
      ciphertext_hash: Array.from(update.ciphertextHash),
      employee_secret: Array.from(update.employeeSecret),
      payrun_id: Array.from(payrunIdBytes),
      merkle_path: path.map((p) => Array.from(p)),
      path_indices: indices,
      payout_pubkey: Array.from(claimerPubkey.toBytes()),
    };

    const { proofBytes, publicInputsBytes } = await prover.proveClaimV2(witnessInputs);

    const claimPackage: ClaimPackageV2 = {
      version: 'v2',
      orgIdHex: payrun.org.orgIdHex,
      payrunIdHex: payrun.payrunIdHex,
      claimerConfAccount: update.claimerConfAccount,
      treasuryConfAccount: payrun.org.treasuryConfAccount,
      zkVerifierProgramId: payrun.org.zkVerifierProgramId,
      incoProgramId: payrun.org.incoProgramId,
      proofB64: Buffer.from(proofBytes).toString('base64'),
      publicInputsB64: Buffer.from(publicInputsBytes).toString('base64'),
      encryptedAmountB64: update.encryptedAmountB64,
      payoutPubkeyHashHex: bytesToHex(update.payoutPubkeyHash),
      ciphertextHashHex: update.ciphertextHashHex,
      nullifierHex: update.nullifierHex,
      salaryCommitmentHex: update.salaryCommitmentHex,
      merkleRootHex,
    };

    const token = randomBytes(32).toString('base64url');
    claimLinks.push({
      claimerConfAccount: update.claimerConfAccount,
      token,
      urlPath: `/claims/${payrun.payrunIdHex}?token=${token}`,
    });

    claimTokenRows.push({
      tokenHash: hashToken(token),
      payrunId: payrun.payrunIdHex,
      payslipId: update.id,
      claimPackageJson: JSON.stringify(claimPackage),
      expiresAt: update.claimTokenExpiresAt,
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const update of payslipUpdates) {
      await tx.payslip.update({
        where: { id: update.id },
        data: {
          employeeCommitmentHex: update.employeeCommitmentHex,
          salaryCommitmentHex: update.salaryCommitmentHex,
          ciphertextHashHex: update.ciphertextHashHex,
          encryptedAmountB64: update.encryptedAmountB64,
          nullifierHex: update.nullifierHex,
          claimTokenExpiresAt: update.claimTokenExpiresAt,
        },
      });
    }

    await tx.payrun.update({
      where: { id: payrunId },
      data: {
        status: PayrunStatus.READY,
        merkleRootHex,
      },
    });

    if (claimTokenRows.length > 0) {
      await tx.claimToken.createMany({
        data: claimTokenRows,
      });
    }
  });

  await createAuditLog({
    orgId: payrun.orgId,
    actorWallet,
    action: AuditActions.VALIDATE_PAYRUN,
    entityType: 'Payrun',
    entityId: payrunId,
    metadata: { merkleRootHex, totalPayslips: payrun.payslips.length },
  });

  return { merkleRootHex, claimLinks };
}

export async function executePayrun(
  payrunId: string,
  actorWallet: string,
  idempotencyKey: string
): Promise<{ status: PayrunStatus; paidCount: number; failedCount: number }> {
  return withIdempotency(`${payrunId}:EXECUTE_PAYRUN`, idempotencyKey, async () => {
    const payrun = await prisma.payrun.findUnique({
      where: { id: payrunId },
      include: { payslips: true },
    });

    if (!payrun) throw new Error('Payrun not found');
    const isExecutable =
      payrun.status === PayrunStatus.DRAFT || payrun.status === PayrunStatus.READY;
    if (!isExecutable) {
      throw new Error(`Cannot execute payrun in ${payrun.status} status`);
    }
    if (payrun.mode !== PayrunMode.BATCH) {
      throw new Error('Only BATCH mode payruns can be executed directly');
    }

    await prisma.payrun.update({
      where: { id: payrunId },
      data: { status: PayrunStatus.EXECUTING, executedBy: actorWallet },
    });

    // Group payslips into batches of 10 for optimized processing
    const BATCH_SIZE = 10;
    const batches = createBatches(payrun.payslips, BATCH_SIZE);
    const batchResults: BatchExecutionResult[] = [];

    console.log(`Processing ${payrun.payslips.length} payslips in ${batches.length} batches`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const processedItems: string[] = [];
      const failedItems: string[] = [];

      // Mark all payslips in batch as processing
      await prisma.payslip.updateMany({
        where: { id: { in: batch.map((p) => p.id) } },
        data: { status: PayslipStatus.PROCESSING },
      });

      // Execute batch with retry logic
      const result = await executeBatchWithRetry(
        async () => {
          // Process all payslips in batch atomically
          await prisma.$transaction(
            batch.map((payslip) =>
              prisma.payslip.update({
                where: { id: payslip.id },
                data: {
                  status: PayslipStatus.PAID,
                  paidAt: new Date(),
                  payoutTxSig: `batch_${batchIndex}_tx_${payslip.id}`,
                },
              })
            )
          );

          // Create ledger entries for all payslips in batch
          await prisma.ledgerEntry.createMany({
            data: batch.map((payslip) => ({
              orgId: payrun.orgId,
              payrunId: payrun.id,
              payslipId: payslip.id,
              type: LedgerEntryType.PAYOUT,
              amount: `-${payslip.amount}`,
              currency: payslip.currency,
              txSig: `batch_${batchIndex}_tx_${payslip.id}`,
              description: `Payout to worker (batch ${batchIndex + 1})`,
            })),
          });

          // Mark all as processed
          batch.forEach((p) => processedItems.push(p.id));

          return `batch_${batchIndex}_signature`;
        },
        3, // max retries
        1000 // delay ms
      );

      if (!result.success) {
        // Mark batch as failed
        await prisma.payslip.updateMany({
          where: { id: { in: batch.map((p) => p.id) } },
          data: { status: PayslipStatus.FAILED },
        });
        batch.forEach((p) => failedItems.push(p.id));
        console.error(`Batch ${batchIndex} failed:`, result.error);
      }

      batchResults.push({
        batchIndex,
        success: result.success,
        itemCount: batch.length,
        signature: result.signature,
        error: result.error,
        processedItems,
        failedItems,
      });
    }

    // Summarize batch execution
    const summary = summarizeBatchExecution(batchResults);
    console.log(
      `Batch execution complete: ${summary.successfulBatches}/${summary.totalBatches} batches succeeded, ` +
      `${summary.processedItems}/${summary.totalItems} items processed`
    );

    const paidCount = summary.processedItems;
    const failedCount = summary.failedItems;
    const paidAmount = payrun.payslips
      .filter((p) => batchResults.some((r) => r.processedItems.includes(p.id)))
      .reduce((sum, p) => sum + BigInt(p.amount), 0n);

    const finalStatus =
      failedCount === 0
        ? PayrunStatus.COMPLETED
        : paidCount === 0
          ? PayrunStatus.FAILED
          : PayrunStatus.COMPLETED; // Partial success still marked as completed

    await prisma.payrun.update({
      where: { id: payrunId },
      data: {
        status: finalStatus,
        paidCount,
        failedCount,
        paidAmount: paidAmount.toString(),
        executedAt: new Date(),
      },
    });

    await createAuditLog({
      orgId: payrun.orgId,
      actorWallet,
      action: AuditActions.EXECUTE_PAYRUN,
      entityType: 'Payrun',
      entityId: payrunId,
      metadata: {
        paidCount,
        failedCount,
        paidAmount: paidAmount.toString(),
        batchCount: batches.length,
        successfulBatches: summary.successfulBatches,
      },
    });

    return { status: finalStatus, paidCount, failedCount };
  });
}

export async function openPayrunForClaims(payrunId: string, actorWallet: string): Promise<void> {
  const payrun = await prisma.payrun.findUnique({ where: { id: payrunId } });

  if (!payrun) throw new Error('Payrun not found');
  if (payrun.status !== PayrunStatus.READY) {
    throw new Error(`Cannot open claims for payrun in ${payrun.status} status`);
  }
  if (payrun.mode !== PayrunMode.CLAIMS) {
    throw new Error('Only CLAIMS mode payruns can be opened for claims');
  }

  await prisma.payrun.update({
    where: { id: payrunId },
    data: { status: PayrunStatus.ACTIVE_CLAIMS },
  });

  await createAuditLog({
    orgId: payrun.orgId,
    actorWallet,
    action: AuditActions.UPDATE_PAYRUN,
    entityType: 'Payrun',
    entityId: payrunId,
    metadata: { action: 'open_claims' },
  });
}

export async function closePayrun(payrunId: string, actorWallet: string): Promise<void> {
  const payrun = await prisma.payrun.findUnique({ where: { id: payrunId } });

  if (!payrun) throw new Error('Payrun not found');
  const closableStatuses: PayrunStatus[] = [
    PayrunStatus.COMPLETED,
    PayrunStatus.FAILED,
    PayrunStatus.ACTIVE_CLAIMS,
  ];
  if (!closableStatuses.includes(payrun.status)) {
    throw new Error(`Cannot close payrun in ${payrun.status} status`);
  }

  await prisma.payrun.update({
    where: { id: payrunId },
    data: { status: PayrunStatus.CLOSED, closedAt: new Date() },
  });

  await createAuditLog({
    orgId: payrun.orgId,
    actorWallet,
    action: AuditActions.CLOSE_PAYRUN,
    entityType: 'Payrun',
    entityId: payrunId,
  });
}

export async function cancelPayrun(payrunId: string, actorWallet: string): Promise<void> {
  const payrun = await prisma.payrun.findUnique({ where: { id: payrunId } });

  if (!payrun) throw new Error('Payrun not found');
  const isClosable =
    payrun.status === PayrunStatus.DRAFT ||
    payrun.status === PayrunStatus.READY ||
    payrun.status === PayrunStatus.COMPLETED ||
    payrun.status === PayrunStatus.FAILED ||
    payrun.status === PayrunStatus.ACTIVE_CLAIMS;
  if (!isClosable) {
    throw new Error(`Cannot close payrun in ${payrun.status} status`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payslip.updateMany({
      where: { payrunId },
      data: { status: PayslipStatus.CANCELLED },
    });

    await tx.payrun.update({
      where: { id: payrunId },
      data: { status: PayrunStatus.CLOSED, closedAt: new Date() },
    });

    await tx.ledgerEntry.create({
      data: {
        orgId: payrun.orgId,
        payrunId,
        type: LedgerEntryType.REVERSAL,
        amount: `-${payrun.totalAmount}`,
        currency: 'USDC',
        description: 'Payrun cancelled - accrual reversed',
      },
    });
  });

  await createAuditLog({
    orgId: payrun.orgId,
    actorWallet,
    action: AuditActions.CANCEL_PAYRUN,
    entityType: 'Payrun',
    entityId: payrunId,
  });
}
