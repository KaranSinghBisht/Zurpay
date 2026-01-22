import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, WorkerType, WorkerStatus, PaySchedule } from '../generated/prisma';

const router = Router();

const CreateWorkerSchema = z.object({
  wallet: z.string(),
  claimerConfAccount: z.string().optional(),
  type: z.enum(['EMPLOYEE', 'CONTRACTOR']).default('EMPLOYEE'),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateWorkerSchema = z.object({
  claimerConfAccount: z.string().optional(),
  type: z.enum(['EMPLOYEE', 'CONTRACTOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  externalId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateCompPlanSchema = z.object({
  currency: z.string().default('USDC'),
  schedule: z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'AD_HOC']).default('MONTHLY'),
  rateAmount: z.string(),
  effectiveFrom: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const UpdateCompPlanSchema = z.object({
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
});

router.get(
  '/:orgId/workers',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, type } = req.query;

      const workers = await prisma.worker.findMany({
        where: {
          orgId: req.params.orgId,
          ...(status && { status: status as WorkerStatus }),
          ...(type && { type: type as WorkerType }),
        },
        include: {
          compPlans: {
            where: {
              effectiveTo: null,
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          _count: {
            select: { payslips: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(workers);
    } catch (error) {
      console.error('List workers error:', error);
      return res.status(500).json({ error: 'Failed to list workers' });
    }
  }
);

router.post(
  '/:orgId/workers',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = CreateWorkerSchema.parse(req.body);
      const orgId = req.params.orgId;

      const existingWorker = await prisma.worker.findUnique({
        where: { orgId_wallet: { orgId, wallet: data.wallet } },
      });

      if (existingWorker) {
        return res.status(409).json({ error: 'Worker with this wallet already exists' });
      }

      const worker = await prisma.worker.create({
        data: {
          orgId,
          wallet: data.wallet,
          claimerConfAccount: data.claimerConfAccount,
          type: data.type as WorkerType,
          displayName: data.displayName,
          email: data.email,
          externalId: data.externalId,
          startDate: data.startDate ? new Date(data.startDate) : null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CREATE_WORKER,
        entityType: 'Worker',
        entityId: worker.id,
        metadata: { wallet: data.wallet, type: data.type },
      });

      return res.status(201).json(worker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Create worker error:', error);
      return res.status(500).json({ error: 'Failed to create worker' });
    }
  }
);

router.get(
  '/:orgId/workers/:workerId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const worker = await prisma.worker.findUnique({
        where: { id: req.params.workerId },
        include: {
          compPlans: {
            orderBy: { effectiveFrom: 'desc' },
          },
          payslips: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              payrun: {
                select: {
                  id: true,
                  payrunIdHex: true,
                  periodStart: true,
                  periodEnd: true,
                },
              },
            },
          },
        },
      });

      if (!worker || worker.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      return res.json(worker);
    } catch (error) {
      console.error('Get worker error:', error);
      return res.status(500).json({ error: 'Failed to get worker' });
    }
  }
);

router.patch(
  '/:orgId/workers/:workerId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = UpdateWorkerSchema.parse(req.body);

      const existingWorker = await prisma.worker.findUnique({
        where: { id: req.params.workerId },
      });

      if (!existingWorker || existingWorker.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      const worker = await prisma.worker.update({
        where: { id: req.params.workerId },
        data: {
          claimerConfAccount: data.claimerConfAccount,
          type: data.type as WorkerType,
          status: data.status as WorkerStatus,
          displayName: data.displayName,
          email: data.email,
          externalId: data.externalId,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        },
      });

      const action =
        data.status === 'INACTIVE' ? AuditActions.DEACTIVATE_WORKER : AuditActions.UPDATE_WORKER;

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action,
        entityType: 'Worker',
        entityId: worker.id,
        metadata: data,
      });

      return res.json(worker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Update worker error:', error);
      return res.status(500).json({ error: 'Failed to update worker' });
    }
  }
);

router.post(
  '/:orgId/workers/:workerId/comp-plans',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = CreateCompPlanSchema.parse(req.body);

      const worker = await prisma.worker.findUnique({
        where: { id: req.params.workerId },
      });

      if (!worker || worker.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      await prisma.compPlan.updateMany({
        where: {
          workerId: req.params.workerId,
          effectiveTo: null,
        },
        data: {
          effectiveTo: new Date(),
        },
      });

      const compPlan = await prisma.compPlan.create({
        data: {
          workerId: req.params.workerId,
          currency: data.currency,
          schedule: data.schedule as PaySchedule,
          rateAmount: data.rateAmount,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
          notes: data.notes,
        },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CREATE_COMP_PLAN,
        entityType: 'CompPlan',
        entityId: compPlan.id,
        metadata: { workerId: req.params.workerId, rateAmount: data.rateAmount },
      });

      return res.status(201).json(compPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Create comp plan error:', error);
      return res.status(500).json({ error: 'Failed to create compensation plan' });
    }
  }
);

router.patch(
  '/:orgId/workers/:workerId/comp-plans/:planId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = UpdateCompPlanSchema.parse(req.body);

      const compPlan = await prisma.compPlan.findUnique({
        where: { id: req.params.planId },
        include: { worker: true },
      });

      if (!compPlan || compPlan.worker.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Compensation plan not found' });
      }

      const updatedPlan = await prisma.compPlan.update({
        where: { id: req.params.planId },
        data: {
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
          notes: data.notes,
        },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.UPDATE_COMP_PLAN,
        entityType: 'CompPlan',
        entityId: updatedPlan.id,
        metadata: data,
      });

      return res.json(updatedPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Update comp plan error:', error);
      return res.status(500).json({ error: 'Failed to update compensation plan' });
    }
  }
);

router.get(
  '/:orgId/audit-logs',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { limit = '50', offset = '0', action } = req.query;

      const logs = await prisma.auditLog.findMany({
        where: {
          orgId: req.params.orgId,
          ...(action && { action: action as string }),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string), 100),
        skip: parseInt(offset as string),
      });

      return res.json(logs);
    } catch (error) {
      console.error('List audit logs error:', error);
      return res.status(500).json({ error: 'Failed to list audit logs' });
    }
  }
);

export default router;
