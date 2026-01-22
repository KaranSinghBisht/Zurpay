import { Router } from 'express';
import { z } from 'zod';
import { PublicKey, Keypair } from '@solana/web3.js';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, ProposalStatus } from '../generated/prisma';
import {
  getCreateMultisigInstruction,
  getMultisigState,
  getProposalStatus,
  MultisigMember,
} from '../services/squads';
import bs58 from 'bs58';

const router = Router();

const ConfigureMultisigSchema = z.object({
  members: z.array(
    z.object({
      wallet: z.string(),
      permissions: z.enum(['all', 'vote', 'initiate', 'execute']),
    })
  ),
  threshold: z.number().min(1),
});

const UpdateMultisigSchema = z.object({
  multisigPda: z.string(),
  vaultPda: z.string(),
  createKey: z.string(),
  threshold: z.number().min(1),
});

router.get(
  '/:orgId/multisig',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const org = await prisma.org.findUnique({
        where: { id: req.params.orgId },
        select: {
          multisigEnabled: true,
          multisigPda: true,
          multisigVaultPda: true,
          multisigThreshold: true,
        },
      });

      if (!org?.multisigEnabled || !org.multisigPda) {
        return res.json({
          enabled: false,
          configured: false,
        });
      }

      const onChainState = await getMultisigState(new PublicKey(org.multisigPda));

      return res.json({
        enabled: true,
        configured: true,
        multisigPda: org.multisigPda,
        vaultPda: org.multisigVaultPda,
        threshold: org.multisigThreshold,
        onChainState,
      });
    } catch (error) {
      console.error('Get multisig config error:', error);
      return res.status(500).json({ error: 'Failed to get multisig configuration' });
    }
  }
);

router.post(
  '/:orgId/multisig/prepare',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = ConfigureMultisigSchema.parse(req.body);
      const wallet = req.wallet!;

      if (data.threshold > data.members.length) {
        return res.status(400).json({
          error: 'Threshold cannot exceed number of members',
        });
      }

      const createKey = Keypair.generate();

      const { multisigPda, vaultPda, instruction } = await getCreateMultisigInstruction({
        createKey,
        creator: new PublicKey(wallet),
        members: data.members as MultisigMember[],
        threshold: data.threshold,
      });

      const serializedInstruction = {
        programId: instruction.programId.toBase58(),
        keys: instruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: instruction.data.toString('base64'),
      };

      return res.json({
        createKey: bs58.encode(createKey.secretKey),
        multisigPda: multisigPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        threshold: data.threshold,
        members: data.members,
        instruction: serializedInstruction,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Prepare multisig error:', error);
      return res.status(500).json({ error: 'Failed to prepare multisig configuration' });
    }
  }
);

router.post(
  '/:orgId/multisig/confirm',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = UpdateMultisigSchema.parse(req.body);
      const orgId = req.params.orgId;

      const onChainState = await getMultisigState(new PublicKey(data.multisigPda));
      if (!onChainState) {
        return res.status(400).json({
          error: 'Multisig not found on-chain. Please create it first.',
        });
      }

      const org = await prisma.org.update({
        where: { id: orgId },
        data: {
          multisigEnabled: true,
          multisigPda: data.multisigPda,
          multisigVaultPda: data.vaultPda,
          multisigCreateKey: data.createKey,
          multisigThreshold: data.threshold,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CONFIGURE_MULTISIG,
        entityType: 'Org',
        entityId: orgId,
        metadata: {
          multisigPda: data.multisigPda,
          vaultPda: data.vaultPda,
          threshold: data.threshold,
        },
      });

      return res.json({
        success: true,
        multisigPda: org.multisigPda,
        vaultPda: org.multisigVaultPda,
        threshold: org.multisigThreshold,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Confirm multisig error:', error);
      return res.status(500).json({ error: 'Failed to confirm multisig configuration' });
    }
  }
);

router.post(
  '/:orgId/multisig/disable',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.params.orgId;

      await prisma.org.update({
        where: { id: orgId },
        data: {
          multisigEnabled: false,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: req.wallet!,
        action: AuditActions.DISABLE_MULTISIG,
        entityType: 'Org',
        entityId: orgId,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Disable multisig error:', error);
      return res.status(500).json({ error: 'Failed to disable multisig' });
    }
  }
);

router.get(
  '/:orgId/multisig/proposals',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.params.orgId;
      const status = req.query.status as string | undefined;

      const where: { orgId: string; status?: ProposalStatus } = { orgId };
      if (status && Object.values(ProposalStatus).includes(status as ProposalStatus)) {
        where.status = status as ProposalStatus;
      }

      const proposals = await prisma.multisigProposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.json(proposals);
    } catch (error) {
      console.error('List proposals error:', error);
      return res.status(500).json({ error: 'Failed to list proposals' });
    }
  }
);

router.get(
  '/:orgId/multisig/proposals/:proposalId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const proposal = await prisma.multisigProposal.findUnique({
        where: { id: req.params.proposalId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const org = await prisma.org.findUnique({
        where: { id: req.params.orgId },
        select: { multisigPda: true },
      });

      let onChainStatus = null;
      if (org?.multisigPda) {
        onChainStatus = await getProposalStatus(
          new PublicKey(org.multisigPda),
          BigInt(proposal.transactionIndex.toString())
        );
      }

      return res.json({
        ...proposal,
        onChainStatus,
      });
    } catch (error) {
      console.error('Get proposal error:', error);
      return res.status(500).json({ error: 'Failed to get proposal' });
    }
  }
);

router.post(
  '/:orgId/multisig/proposals/:proposalId/sync',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const proposal = await prisma.multisigProposal.findUnique({
        where: { id: req.params.proposalId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const org = await prisma.org.findUnique({
        where: { id: req.params.orgId },
        select: { multisigPda: true },
      });

      if (!org?.multisigPda) {
        return res.status(400).json({ error: 'Multisig not configured' });
      }

      const onChainStatus = await getProposalStatus(
        new PublicKey(org.multisigPda),
        BigInt(proposal.transactionIndex.toString())
      );

      if (!onChainStatus) {
        return res.status(404).json({ error: 'Proposal not found on-chain' });
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

      const updated = await prisma.multisigProposal.update({
        where: { id: req.params.proposalId },
        data: {
          status: newStatus,
          approvals: onChainStatus.approvals,
          rejections: onChainStatus.rejections,
        },
      });

      return res.json(updated);
    } catch (error) {
      console.error('Sync proposal error:', error);
      return res.status(500).json({ error: 'Failed to sync proposal status' });
    }
  }
);

export default router;
