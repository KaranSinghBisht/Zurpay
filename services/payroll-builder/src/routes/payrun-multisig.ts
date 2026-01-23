import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { MemberRole } from '../generated/prisma';
import {
  proposePayrunToMultisig,
  getPayrunApprovalInstruction,
  getPayrunRejectionInstruction,
  getPayrunExecuteInstruction,
  syncProposalStatus,
  getPayrunProposals,
  getOrgMultisigInfo,
} from '../services/payrun-multisig';
import { createAuditLog, AuditActions } from '../services/audit';

const router = Router();

/**
 * POST /:orgId/payruns/:payrunId/propose-multisig
 * Propose a validated payrun to the Squads multisig for on-chain approval
 */
router.post(
  '/:orgId/payruns/:payrunId/propose-multisig',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, payrunId } = req.params;
      const wallet = req.wallet!;

      // Verify payrun belongs to org
      const payrun = await prisma.payrun.findFirst({
        where: { id: payrunId, orgId },
      });

      if (!payrun) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      const result = await proposePayrunToMultisig(payrunId, wallet);

      // Serialize instructions for client-side signing
      const serializedResult = {
        proposalId: result.proposalId,
        transactionIndex: result.transactionIndex.toString(),
        vaultTransactionIx: {
          programId: result.vaultTransactionIx.programId.toBase58(),
          keys: result.vaultTransactionIx.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: result.vaultTransactionIx.data.toString('base64'),
        },
        proposalCreateIx: {
          programId: result.proposalCreateIx.programId.toBase58(),
          keys: result.proposalCreateIx.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: result.proposalCreateIx.data.toString('base64'),
        },
      };

      return res.json(serializedResult);
    } catch (error) {
      console.error('Propose to multisig error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to propose to multisig',
      });
    }
  }
);

/**
 * GET /:orgId/payruns/:payrunId/multisig-proposals
 * Get all multisig proposals for a payrun
 */
router.get(
  '/:orgId/payruns/:payrunId/multisig-proposals',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { payrunId } = req.params;

      const proposals = await getPayrunProposals(payrunId);

      return res.json(proposals);
    } catch (error) {
      console.error('Get multisig proposals error:', error);
      return res.status(500).json({ error: 'Failed to get multisig proposals' });
    }
  }
);

/**
 * POST /:orgId/multisig-proposals/:proposalId/approve
 * Get the approval instruction for a multisig member to sign
 */
router.post(
  '/:orgId/multisig-proposals/:proposalId/approve',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.APPROVER, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, proposalId } = req.params;
      const wallet = req.wallet!;

      // Verify proposal belongs to org
      const proposal = await prisma.multisigProposal.findFirst({
        where: { id: proposalId, orgId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const result = await getPayrunApprovalInstruction(proposalId, wallet);

      const serializedIx = {
        programId: result.instruction.programId.toBase58(),
        keys: result.instruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: result.instruction.data.toString('base64'),
      };

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.APPROVE_MULTISIG_PROPOSAL,
        entityType: 'MultisigProposal',
        entityId: proposalId,
      });

      return res.json({ instruction: serializedIx });
    } catch (error) {
      console.error('Get approval instruction error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get approval instruction',
      });
    }
  }
);

/**
 * POST /:orgId/multisig-proposals/:proposalId/reject
 * Get the rejection instruction for a multisig member to sign
 */
router.post(
  '/:orgId/multisig-proposals/:proposalId/reject',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.APPROVER, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, proposalId } = req.params;
      const wallet = req.wallet!;

      // Verify proposal belongs to org
      const proposal = await prisma.multisigProposal.findFirst({
        where: { id: proposalId, orgId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const result = await getPayrunRejectionInstruction(proposalId, wallet);

      const serializedIx = {
        programId: result.instruction.programId.toBase58(),
        keys: result.instruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: result.instruction.data.toString('base64'),
      };

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.REJECT_MULTISIG_PROPOSAL,
        entityType: 'MultisigProposal',
        entityId: proposalId,
      });

      return res.json({ instruction: serializedIx });
    } catch (error) {
      console.error('Get rejection instruction error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get rejection instruction',
      });
    }
  }
);

/**
 * POST /:orgId/multisig-proposals/:proposalId/execute
 * Get the execute instruction for an approved proposal
 */
router.post(
  '/:orgId/multisig-proposals/:proposalId/execute',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, proposalId } = req.params;
      const wallet = req.wallet!;

      // Verify proposal belongs to org
      const proposal = await prisma.multisigProposal.findFirst({
        where: { id: proposalId, orgId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const result = await getPayrunExecuteInstruction(proposalId, wallet);

      const serializedIx = {
        programId: result.instruction.programId.toBase58(),
        keys: result.instruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: result.instruction.data.toString('base64'),
      };

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.EXECUTE_MULTISIG_PROPOSAL,
        entityType: 'MultisigProposal',
        entityId: proposalId,
      });

      return res.json({ instruction: serializedIx });
    } catch (error) {
      console.error('Get execute instruction error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get execute instruction',
      });
    }
  }
);

/**
 * POST /:orgId/multisig-proposals/:proposalId/sync
 * Sync proposal status from on-chain
 */
router.post(
  '/:orgId/multisig-proposals/:proposalId/sync',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, proposalId } = req.params;

      // Verify proposal belongs to org
      const proposal = await prisma.multisigProposal.findFirst({
        where: { id: proposalId, orgId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const result = await syncProposalStatus(proposalId);

      return res.json({
        proposal: result.proposal,
        payrunUpdated: result.payrunUpdated,
      });
    } catch (error) {
      console.error('Sync proposal status error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync proposal status',
      });
    }
  }
);

/**
 * POST /:orgId/multisig-proposals/:proposalId/confirm-execution
 * Called after the client has executed the proposal on-chain
 */
const ConfirmExecutionSchema = z.object({
  txSignature: z.string().min(1),
});

router.post(
  '/:orgId/multisig-proposals/:proposalId/confirm-execution',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, proposalId } = req.params;
      const wallet = req.wallet!;
      const data = ConfirmExecutionSchema.parse(req.body);

      // Verify proposal belongs to org
      const proposal = await prisma.multisigProposal.findFirst({
        where: { id: proposalId, orgId },
        include: { org: true },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      // Sync from on-chain first to confirm execution
      const syncResult = await syncProposalStatus(proposalId);

      if (syncResult.proposal.status !== 'EXECUTED') {
        return res.status(400).json({
          error: 'Proposal has not been executed on-chain',
          currentStatus: syncResult.proposal.status,
        });
      }

      // Update the proposal with the tx signature
      const updatedProposal = await prisma.multisigProposal.update({
        where: { id: proposalId },
        data: {
          txSignature: data.txSignature,
          executedBy: wallet,
          executedAt: new Date(),
        },
      });

      // If this was a payrun proposal, also update the payrun
      if (proposal.payrunId) {
        await prisma.payrun.update({
          where: { id: proposal.payrunId },
          data: {
            onChainTxSig: data.txSignature,
          },
        });
      }

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.CONFIRM_MULTISIG_EXECUTION,
        entityType: 'MultisigProposal',
        entityId: proposalId,
        metadata: { txSignature: data.txSignature },
      });

      return res.json({
        success: true,
        proposal: updatedProposal,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Confirm execution error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to confirm execution',
      });
    }
  }
);

/**
 * GET /:orgId/multisig-info
 * Get multisig configuration and status for an org
 */
router.get(
  '/:orgId/multisig-info',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId } = req.params;

      const info = await getOrgMultisigInfo(orgId);

      return res.json(info);
    } catch (error) {
      console.error('Get multisig info error:', error);
      return res.status(500).json({ error: 'Failed to get multisig info' });
    }
  }
);

export default router;
