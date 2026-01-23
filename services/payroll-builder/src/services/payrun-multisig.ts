import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { prisma } from '../db';
import { PayrunStatus, ProposalStatus, ProposalType } from '../generated/prisma';
import { createAuditLog, AuditActions } from './audit';
import {
  getProposalInstructions,
  getApprovalInstruction,
  getRejectionInstruction,
  getExecuteInstruction,
  getProposalStatus,
  getMultisigState,
  canExecuteProposal,
} from './squads';
import { hexToBytes, deriveOrgPda, derivePayrunPda } from '@zurpay/sdk';

const ZURPAY_PROGRAM_ID = new PublicKey(
  process.env.ZURPAY_PROGRAM_ID || 'Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9'
);

export interface ProposePayrunResult {
  proposalId: string;
  transactionIndex: bigint;
  vaultTransactionIx: TransactionInstruction;
  proposalCreateIx: TransactionInstruction;
}

export interface VoteResult {
  instruction: TransactionInstruction;
}

export interface ExecuteResult {
  instruction: TransactionInstruction;
}

/**
 * Build the set_payrun instruction for a payrun
 */
function buildSetPayrunInstruction(params: {
  admin: PublicKey;
  orgIdHex: string;
  payrunIdHex: string;
  merkleRootHex: string;
  totalEmployees: number;
  claimDeadline: Date | null;
}): TransactionInstruction {
  const { admin, orgIdHex, payrunIdHex, merkleRootHex, totalEmployees, claimDeadline } = params;

  const orgIdBytes = hexToBytes(orgIdHex);
  const payrunIdBytes = hexToBytes(payrunIdHex);
  const merkleRootBytes = hexToBytes(merkleRootHex);

  const orgPda = deriveOrgPda(orgIdBytes, ZURPAY_PROGRAM_ID);
  const payrunPda = derivePayrunPda(orgIdBytes, payrunIdBytes, ZURPAY_PROGRAM_ID);

  // set_payrun discriminator
  const discriminator = Buffer.from([106, 77, 86, 198, 171, 28, 92, 59]);

  const totalEmployeesBuf = Buffer.alloc(4);
  totalEmployeesBuf.writeUInt32LE(totalEmployees, 0);

  const deadlineUnix = claimDeadline
    ? Math.floor(claimDeadline.getTime() / 1000)
    : Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60); // 30 days default

  const deadlineBuf = Buffer.alloc(8);
  deadlineBuf.writeBigInt64LE(BigInt(deadlineUnix), 0);

  const data = Buffer.concat([
    discriminator,
    Buffer.from(payrunIdBytes),
    Buffer.from(merkleRootBytes),
    totalEmployeesBuf,
    deadlineBuf,
  ]);

  return new TransactionInstruction({
    programId: ZURPAY_PROGRAM_ID,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: orgPda, isSigner: false, isWritable: true },
      { pubkey: payrunPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Propose a payrun to the Squads multisig for approval
 */
export async function proposePayrunToMultisig(
  payrunId: string,
  actorWallet: string
): Promise<ProposePayrunResult> {
  const payrun = await prisma.payrun.findUnique({
    where: { id: payrunId },
    include: { org: true },
  });

  if (!payrun) {
    throw new Error('Payrun not found');
  }

  if (payrun.status !== PayrunStatus.READY) {
    throw new Error(`Cannot propose payrun with status ${payrun.status}. Must be READY.`);
  }

  if (!payrun.merkleRootHex) {
    throw new Error('Payrun must be validated before proposing to multisig');
  }

  const org = payrun.org;
  if (!org.multisigEnabled || !org.multisigPda || !org.multisigVaultPda) {
    throw new Error('Organization does not have multisig enabled');
  }

  const multisigPda = new PublicKey(org.multisigPda);
  const vaultPda = new PublicKey(org.multisigVaultPda);

  // Build the set_payrun instruction with vault as the signer
  const setPayrunIx = buildSetPayrunInstruction({
    admin: vaultPda, // Vault will be the signer when executed
    orgIdHex: org.orgIdHex,
    payrunIdHex: payrun.payrunIdHex,
    merkleRootHex: payrun.merkleRootHex,
    totalEmployees: payrun.totalPayslips,
    claimDeadline: payrun.claimDeadline,
  });

  // Create the Squads proposal
  const { transactionIndex, vaultTransactionIx, proposalCreateIx } = await getProposalInstructions({
    multisigPda,
    creator: new PublicKey(actorWallet),
    instructions: [setPayrunIx],
  });

  // Create the proposal record in the database
  const proposal = await prisma.multisigProposal.create({
    data: {
      orgId: org.id,
      transactionIndex,
      type: ProposalType.PAYRUN_EXECUTE,
      status: ProposalStatus.PENDING,
      payrunId: payrun.id,
      title: `Post Payrun ${payrun.payrunIdHex.slice(0, 16)}... On-Chain`,
      description: `Approve posting payrun with ${payrun.totalPayslips} payslips totaling ${payrun.totalAmount} to Solana.`,
      proposedBy: actorWallet,
      approvals: [],
      rejections: [],
    },
  });

  // Update the payrun status
  await prisma.payrun.update({
    where: { id: payrunId },
    data: {
      status: PayrunStatus.PENDING_APPROVAL,
      requiresApproval: true,
    },
  });

  await createAuditLog({
    orgId: org.id,
    actorWallet,
    action: AuditActions.PROPOSE_TO_MULTISIG,
    entityType: 'Payrun',
    entityId: payrunId,
    metadata: {
      proposalId: proposal.id,
      transactionIndex: transactionIndex.toString(),
    },
  });

  return {
    proposalId: proposal.id,
    transactionIndex,
    vaultTransactionIx,
    proposalCreateIx,
  };
}

/**
 * Get the approval instruction for voting on a payrun proposal
 */
export async function getPayrunApprovalInstruction(
  proposalId: string,
  memberWallet: string
): Promise<VoteResult> {
  const proposal = await prisma.multisigProposal.findUnique({
    where: { id: proposalId },
    include: { org: true },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== ProposalStatus.PENDING) {
    throw new Error(`Cannot vote on proposal with status ${proposal.status}`);
  }

  if (!proposal.org.multisigPda) {
    throw new Error('Multisig not configured');
  }

  const instruction = getApprovalInstruction({
    multisigPda: new PublicKey(proposal.org.multisigPda),
    transactionIndex: BigInt(proposal.transactionIndex.toString()),
    member: new PublicKey(memberWallet),
  });

  return { instruction };
}

/**
 * Get the rejection instruction for voting against a payrun proposal
 */
export async function getPayrunRejectionInstruction(
  proposalId: string,
  memberWallet: string
): Promise<VoteResult> {
  const proposal = await prisma.multisigProposal.findUnique({
    where: { id: proposalId },
    include: { org: true },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (proposal.status !== ProposalStatus.PENDING) {
    throw new Error(`Cannot vote on proposal with status ${proposal.status}`);
  }

  if (!proposal.org.multisigPda) {
    throw new Error('Multisig not configured');
  }

  const instruction = getRejectionInstruction({
    multisigPda: new PublicKey(proposal.org.multisigPda),
    transactionIndex: BigInt(proposal.transactionIndex.toString()),
    member: new PublicKey(memberWallet),
  });

  return { instruction };
}

/**
 * Get the execute instruction for an approved payrun proposal
 */
export async function getPayrunExecuteInstruction(
  proposalId: string,
  memberWallet: string
): Promise<ExecuteResult> {
  const proposal = await prisma.multisigProposal.findUnique({
    where: { id: proposalId },
    include: { org: true },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (!proposal.org.multisigPda) {
    throw new Error('Multisig not configured');
  }

  const multisigPda = new PublicKey(proposal.org.multisigPda);
  const transactionIndex = BigInt(proposal.transactionIndex.toString());

  // Check if the proposal can be executed
  const canExecute = await canExecuteProposal(multisigPda, transactionIndex);
  if (!canExecute) {
    throw new Error('Proposal has not reached the required approval threshold');
  }

  const instruction = await getExecuteInstruction({
    multisigPda,
    transactionIndex,
    member: new PublicKey(memberWallet),
  });

  return { instruction };
}

/**
 * Sync proposal status from on-chain and update payrun if executed
 */
export async function syncProposalStatus(proposalId: string): Promise<{
  proposal: Awaited<ReturnType<typeof prisma.multisigProposal.update>>;
  payrunUpdated: boolean;
}> {
  const proposal = await prisma.multisigProposal.findUnique({
    where: { id: proposalId },
    include: { org: true },
  });

  if (!proposal) {
    throw new Error('Proposal not found');
  }

  if (!proposal.org.multisigPda) {
    throw new Error('Multisig not configured');
  }

  const onChainStatus = await getProposalStatus(
    new PublicKey(proposal.org.multisigPda),
    BigInt(proposal.transactionIndex.toString())
  );

  if (!onChainStatus) {
    throw new Error('Proposal not found on-chain');
  }

  let newStatus: ProposalStatus = proposal.status;
  switch (onChainStatus.status) {
    case 'approved':
      newStatus = ProposalStatus.APPROVED;
      break;
    case 'rejected':
      newStatus = ProposalStatus.REJECTED;
      break;
    case 'executed':
      newStatus = ProposalStatus.EXECUTED;
      break;
    case 'cancelled':
      newStatus = ProposalStatus.CANCELLED;
      break;
  }

  const updatedProposal = await prisma.multisigProposal.update({
    where: { id: proposalId },
    data: {
      status: newStatus,
      approvals: onChainStatus.approvals,
      rejections: onChainStatus.rejections,
      ...(newStatus === ProposalStatus.EXECUTED && { executedAt: new Date() }),
    },
  });

  // If executed and this is a payrun proposal, update the payrun status
  let payrunUpdated = false;
  if (newStatus === ProposalStatus.EXECUTED && proposal.payrunId) {
    await prisma.payrun.update({
      where: { id: proposal.payrunId },
      data: {
        status: PayrunStatus.ACTIVE_CLAIMS,
        // Note: The actual on-chain tx signature should be recorded separately
      },
    });
    payrunUpdated = true;
  } else if (newStatus === ProposalStatus.REJECTED && proposal.payrunId) {
    await prisma.payrun.update({
      where: { id: proposal.payrunId },
      data: {
        status: PayrunStatus.READY, // Reset to READY so they can try again
        rejectedBy: 'multisig',
        rejectedAt: new Date(),
        rejectionReason: 'Multisig proposal was rejected',
      },
    });
    payrunUpdated = true;
  }

  return { proposal: updatedProposal, payrunUpdated };
}

/**
 * Get pending multisig proposals for a payrun
 */
export async function getPayrunProposals(payrunId: string) {
  return prisma.multisigProposal.findMany({
    where: { payrunId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Check if org has multisig enabled and get its state
 */
export async function getOrgMultisigInfo(orgId: string) {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: {
      multisigEnabled: true,
      multisigPda: true,
      multisigVaultPda: true,
      multisigThreshold: true,
    },
  });

  if (!org?.multisigEnabled || !org.multisigPda) {
    return { enabled: false, state: null };
  }

  const state = await getMultisigState(new PublicKey(org.multisigPda));

  return {
    enabled: true,
    multisigPda: org.multisigPda,
    vaultPda: org.multisigVaultPda,
    threshold: org.multisigThreshold,
    state,
  };
}
