import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';

import {
  createPayrunFromWorkers,
  validatePayrun,
  executePayrun,
  openPayrunForClaims,
  closePayrun,
  cancelPayrun,
} from '../services/payrun-service';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, PayrunStatus, PayrunMode } from '../generated/prisma';

const router = Router();

const CreatePayrunSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  mode: z.enum(['BATCH', 'CLAIMS']).default('BATCH'),
  claimDeadline: z.string().datetime().optional(),
  workerIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const ExecutePayrunSchema = z.object({
  idempotencyKey: z.string(),
});

const SetOnChainSchema = z.object({
  txSignature: z.string().min(1),
});

router.get(
  '/:orgId/payruns',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, limit = '20', offset = '0' } = req.query;

      const payruns = await prisma.payrun.findMany({
        where: {
          orgId: req.params.orgId,
          ...(status && { status: status as PayrunStatus }),
        },
        include: {
          _count: {
            select: { payslips: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string), 100),
        skip: parseInt(offset as string),
      });

      return res.json(payruns);
    } catch (error) {
      console.error('List payruns error:', error);
      return res.status(500).json({ error: 'Failed to list payruns' });
    }
  }
);

router.post(
  '/:orgId/payruns',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = CreatePayrunSchema.parse(req.body);

      const result = await createPayrunFromWorkers({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
        mode: data.mode as PayrunMode,
        claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : undefined,
        workerIds: data.workerIds,
        notes: data.notes,
      });

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Create payrun error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to create payrun' });
    }
  }
);

router.get(
  '/:orgId/payruns/:payrunId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
        include: {
          payslips: {
            include: {
              worker: {
                select: {
                  id: true,
                  wallet: true,
                  displayName: true,
                  type: true,
                },
              },
            },
          },
          _count: {
            select: { payslips: true },
          },
        },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      return res.json(payrun);
    } catch (error) {
      console.error('Get payrun error:', error);
      return res.status(500).json({ error: 'Failed to get payrun' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/validate',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      const result = await validatePayrun(req.params.payrunId, req.wallet!);
      return res.json(result);
    } catch (error) {
      console.error('Validate payrun error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to validate payrun' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/execute',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = ExecutePayrunSchema.parse(req.body);

      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      const result = await executePayrun(req.params.payrunId, req.wallet!, data.idempotencyKey);
      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Execute payrun error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to execute payrun' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/open-claims',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      await openPayrunForClaims(req.params.payrunId, req.wallet!);
      return res.json({ success: true });
    } catch (error) {
      console.error('Open claims error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to open claims' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/set-onchain',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = SetOnChainSchema.parse(req.body);

      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      await prisma.payrun.update({
        where: { id: payrun.id },
        data: { onChainTxSig: data.txSignature },
      });

      await createAuditLog({
        orgId: payrun.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.UPDATE_PAYRUN,
        entityType: 'Payrun',
        entityId: payrun.id,
        metadata: { onChainTxSig: data.txSignature },
      });

      return res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Set on-chain payrun error:', error);
      return res.status(500).json({ error: 'Failed to update on-chain tx' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/close',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      await closePayrun(req.params.payrunId, req.wallet!);
      return res.json({ success: true });
    } catch (error) {
      console.error('Close payrun error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to close payrun' });
    }
  }
);

router.post(
  '/:orgId/payruns/:payrunId/cancel',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      await cancelPayrun(req.params.payrunId, req.wallet!);
      return res.json({ success: true });
    } catch (error) {
      console.error('Cancel payrun error:', error);
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to cancel payrun' });
    }
  }
);

export default router;
