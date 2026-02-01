import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, ScheduleFrequency, ScheduleStatus, PayrunStatus } from '../generated/prisma';
import crypto from 'crypto';
import { bytesToHex } from '@zurpay/sdk';

const router = Router();

const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  secondDayOfMonth: z.number().min(1).max(31).optional(),
  workerIds: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  claimDeadlineDays: z.number().min(1).max(90).optional(),
});

const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  secondDayOfMonth: z.number().min(1).max(31).optional(),
  workerIds: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  claimDeadlineDays: z.number().min(1).max(90).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
});

function calculateNextRunDate(
  frequency: ScheduleFrequency,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
  secondDayOfMonth?: number | null,
  fromDate?: Date
): Date {
  const now = fromDate || new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'WEEKLY': {
      const targetDay = dayOfWeek ?? 5;
      const daysUntil = (targetDay - next.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil);
      break;
    }
    case 'BIWEEKLY': {
      const targetDay = dayOfWeek ?? 5;
      const daysUntil = (targetDay - next.getDay() + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntil + 7);
      break;
    }
    case 'SEMIMONTHLY': {
      const day1 = dayOfMonth ?? 15;
      const day2 = secondDayOfMonth ?? 30;
      const currentDay = next.getDate();

      if (currentDay < day1) {
        next.setDate(day1);
      } else if (currentDay < day2) {
        next.setDate(day2);
      } else {
        next.setMonth(next.getMonth() + 1);
        next.setDate(day1);
      }
      break;
    }
    case 'MONTHLY': {
      const targetDay = dayOfMonth ?? 1;
      if (next.getDate() >= targetDay) {
        next.setMonth(next.getMonth() + 1);
      }
      next.setDate(
        Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())
      );
      break;
    }
  }

  next.setHours(9, 0, 0, 0);
  return next;
}

router.get(
  '/:orgId/schedules',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId } = req.params;
      const status = req.query.status as string | undefined;

      const where: { orgId: string; status?: ScheduleStatus } = { orgId };
      if (status && Object.values(ScheduleStatus).includes(status as ScheduleStatus)) {
        where.status = status as ScheduleStatus;
      }

      const schedules = await prisma.recurringSchedule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return res.json(schedules);
    } catch (error) {
      console.error('List schedules error:', error);
      return res.status(500).json({ error: 'Failed to list schedules' });
    }
  }
);

router.get(
  '/:orgId/schedules/:scheduleId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const schedule = await prisma.recurringSchedule.findFirst({
        where: { id: req.params.scheduleId, orgId: req.params.orgId },
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      return res.json(schedule);
    } catch (error) {
      console.error('Get schedule error:', error);
      return res.status(500).json({ error: 'Failed to get schedule' });
    }
  }
);

router.post(
  '/:orgId/schedules',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId } = req.params;
      const data = CreateScheduleSchema.parse(req.body);
      const wallet = req.wallet!;

      if (data.frequency === 'WEEKLY' || data.frequency === 'BIWEEKLY') {
        if (data.dayOfWeek === undefined) {
          return res
            .status(400)
            .json({ error: 'dayOfWeek is required for weekly/biweekly schedules' });
        }
      }

      if (data.frequency === 'MONTHLY') {
        if (data.dayOfMonth === undefined) {
          return res.status(400).json({ error: 'dayOfMonth is required for monthly schedules' });
        }
      }

      if (data.frequency === 'SEMIMONTHLY') {
        if (data.dayOfMonth === undefined || data.secondDayOfMonth === undefined) {
          return res.status(400).json({
            error: 'dayOfMonth and secondDayOfMonth are required for semi-monthly schedules',
          });
        }
      }

      const nextRunAt = calculateNextRunDate(
        data.frequency as ScheduleFrequency,
        data.dayOfWeek,
        data.dayOfMonth,
        data.secondDayOfMonth
      );

      const schedule = await prisma.recurringSchedule.create({
        data: {
          orgId,
          name: data.name,
          frequency: data.frequency as ScheduleFrequency,
          dayOfWeek: data.dayOfWeek,
          dayOfMonth: data.dayOfMonth,
          secondDayOfMonth: data.secondDayOfMonth,
          workerIds: data.workerIds || [],
          autoApprove: data.autoApprove ?? false,
          requiresApproval: data.requiresApproval ?? true,
          claimDeadlineDays: data.claimDeadlineDays ?? 30,
          nextRunAt,
          createdBy: wallet,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.CREATE_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: schedule.id,
        metadata: { name: data.name, frequency: data.frequency },
      });

      return res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Create schedule error:', error);
      return res.status(500).json({ error: 'Failed to create schedule' });
    }
  }
);

router.patch(
  '/:orgId/schedules/:scheduleId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, scheduleId } = req.params;
      const data = UpdateScheduleSchema.parse(req.body);
      const wallet = req.wallet!;

      const existing = await prisma.recurringSchedule.findFirst({
        where: { id: scheduleId, orgId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const frequency = (data.frequency ?? existing.frequency) as ScheduleFrequency;
      const dayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
      const dayOfMonth = data.dayOfMonth ?? existing.dayOfMonth;
      const secondDayOfMonth = data.secondDayOfMonth ?? existing.secondDayOfMonth;

      const nextRunAt = calculateNextRunDate(frequency, dayOfWeek, dayOfMonth, secondDayOfMonth);

      const schedule = await prisma.recurringSchedule.update({
        where: { id: scheduleId },
        data: {
          ...data,
          frequency: data.frequency as ScheduleFrequency | undefined,
          status: data.status as ScheduleStatus | undefined,
          nextRunAt,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.UPDATE_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: scheduleId,
        metadata: data,
      });

      return res.json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Update schedule error:', error);
      return res.status(500).json({ error: 'Failed to update schedule' });
    }
  }
);

router.delete(
  '/:orgId/schedules/:scheduleId',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, scheduleId } = req.params;
      const wallet = req.wallet!;

      const existing = await prisma.recurringSchedule.findFirst({
        where: { id: scheduleId, orgId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      await prisma.recurringSchedule.update({
        where: { id: scheduleId },
        data: { status: ScheduleStatus.CANCELLED },
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.DELETE_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: scheduleId,
      });

      return res.status(204).send();
    } catch (error) {
      console.error('Delete schedule error:', error);
      return res.status(500).json({ error: 'Failed to delete schedule' });
    }
  }
);

const EnableOnChainSchema = z.object({
  onChainScheduleId: z.string().length(64).optional(),
});

router.post(
  '/:orgId/schedules/:scheduleId/enable-onchain',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, scheduleId } = req.params;
      const wallet = req.wallet!;
      const data = EnableOnChainSchema.parse(req.body);

      const schedule = await prisma.recurringSchedule.findFirst({
        where: { id: scheduleId, orgId },
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      if (schedule.onChainScheduleId) {
        return res.status(400).json({
          error: 'Schedule already has on-chain automation enabled',
          onChainScheduleId: schedule.onChainScheduleId,
        });
      }

      const onChainScheduleId = data.onChainScheduleId || bytesToHex(crypto.randomBytes(32));

      const updated = await prisma.recurringSchedule.update({
        where: { id: scheduleId },
        data: { onChainScheduleId },
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.UPDATE_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: scheduleId,
        metadata: { action: 'enable_onchain', onChainScheduleId },
      });

      return res.json({
        message: 'On-chain automation enabled',
        schedule: updated,
        onChainScheduleId,
        nextStep:
          'Create the on-chain schedule account using the SDK createSchedule function with this onChainScheduleId',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Enable on-chain schedule error:', error);
      return res.status(500).json({ error: 'Failed to enable on-chain automation' });
    }
  }
);

router.post(
  '/:orgId/schedules/:scheduleId/disable-onchain',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, scheduleId } = req.params;
      const wallet = req.wallet!;

      const schedule = await prisma.recurringSchedule.findFirst({
        where: { id: scheduleId, orgId },
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      if (!schedule.onChainScheduleId) {
        return res
          .status(400)
          .json({ error: 'Schedule does not have on-chain automation enabled' });
      }

      const updated = await prisma.recurringSchedule.update({
        where: { id: scheduleId },
        data: { onChainScheduleId: null },
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.UPDATE_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: scheduleId,
        metadata: { action: 'disable_onchain' },
      });

      return res.json({
        message: 'On-chain automation disabled',
        schedule: updated,
        note: 'The on-chain schedule account will remain on-chain but the keeper will no longer execute it',
      });
    } catch (error) {
      console.error('Disable on-chain schedule error:', error);
      return res.status(500).json({ error: 'Failed to disable on-chain automation' });
    }
  }
);

router.post(
  '/:orgId/schedules/:scheduleId/run-now',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, scheduleId } = req.params;
      const wallet = req.wallet!;

      const schedule = await prisma.recurringSchedule.findFirst({
        where: { id: scheduleId, orgId },
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      if (schedule.status !== ScheduleStatus.ACTIVE) {
        return res.status(400).json({ error: 'Schedule is not active' });
      }

      const workers =
        schedule.workerIds.length > 0
          ? await prisma.worker.findMany({
              where: { id: { in: schedule.workerIds }, orgId, status: 'ACTIVE' },
              include: { compPlans: { where: { effectiveTo: null } } },
            })
          : await prisma.worker.findMany({
              where: { orgId, status: 'ACTIVE' },
              include: { compPlans: { where: { effectiveTo: null } } },
            });

      if (workers.length === 0) {
        return res.status(400).json({ error: 'No active workers found for this schedule' });
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const claimDeadline = new Date(now);
      claimDeadline.setDate(claimDeadline.getDate() + schedule.claimDeadlineDays);

      const payrunIdHex = crypto.randomBytes(32).toString('hex');

      const payslipsData = workers
        .filter((w) => w.compPlans.length > 0)
        .map((w) => ({
          workerId: w.id,
          amount: w.compPlans[0].rateAmount,
          currency: w.compPlans[0].currency,
        }));

      if (payslipsData.length === 0) {
        return res.status(400).json({ error: 'No workers with active compensation plans' });
      }

      const totalAmount = payslipsData.reduce((sum, p) => sum + BigInt(p.amount), 0n);

      const payrun = await prisma.$transaction(async (tx) => {
        const newPayrun = await tx.payrun.create({
          data: {
            orgId,
            payrunIdHex,
            periodStart,
            periodEnd,
            status: schedule.requiresApproval ? PayrunStatus.PENDING_APPROVAL : PayrunStatus.DRAFT,
            mode: 'CLAIMS',
            totalPayslips: payslipsData.length,
            totalAmount: totalAmount.toString(),
            claimDeadline,
            createdBy: wallet,
            requiresApproval: schedule.requiresApproval,
            notes: `Auto-generated from schedule: ${schedule.name}`,
          },
        });

        await tx.payslip.createMany({
          data: payslipsData.map((p) => ({
            payrunId: newPayrun.id,
            ...p,
          })),
        });

        if (schedule.requiresApproval) {
          await tx.approvalRequest.create({
            data: {
              payrunId: newPayrun.id,
              requestedBy: wallet,
              comments: `Automatically submitted from recurring schedule: ${schedule.name}`,
            },
          });
        }

        await tx.recurringSchedule.update({
          where: { id: scheduleId },
          data: {
            lastRunAt: now,
            lastPayrunId: newPayrun.id,
            nextRunAt: calculateNextRunDate(
              schedule.frequency,
              schedule.dayOfWeek,
              schedule.dayOfMonth,
              schedule.secondDayOfMonth,
              now
            ),
          },
        });

        return newPayrun;
      });

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.RUN_SCHEDULE,
        entityType: 'RecurringSchedule',
        entityId: scheduleId,
        metadata: { payrunId: payrun.id },
      });

      return res.json({
        schedule,
        payrun,
      });
    } catch (error) {
      console.error('Run schedule error:', error);
      return res.status(500).json({ error: 'Failed to run schedule' });
    }
  }
);

export default router;
