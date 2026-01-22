import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole } from '../generated/prisma';

const router = Router();

const CreateOrgSchema = z.object({
  orgIdHex: z.string().length(64),
  name: z.string().min(1).max(100),
  treasuryConfAccount: z.string(),
  zkVerifierProgramId: z.string(),
  incoProgramId: z.string(),
  settings: z.record(z.unknown()).optional(),
});

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
});

const AddMemberSchema = z.object({
  wallet: z.string(),
  role: z.enum(['ADMIN', 'VIEWER', 'AUDITOR']),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'VIEWER', 'AUDITOR']),
});

router.post('/', requireWallet, async (req: AuthenticatedRequest, res) => {
  try {
    const data = CreateOrgSchema.parse(req.body);
    const wallet = req.wallet!;

    const existingOrg = await prisma.org.findUnique({
      where: { orgIdHex: data.orgIdHex },
    });

    if (existingOrg) {
      return res.status(409).json({ error: 'Organization with this ID already exists' });
    }

    const org = await prisma.org.create({
      data: {
        orgIdHex: data.orgIdHex,
        name: data.name,
        ownerWallet: wallet,
        treasuryConfAccount: data.treasuryConfAccount,
        zkVerifierProgramId: data.zkVerifierProgramId,
        incoProgramId: data.incoProgramId,
        settings: data.settings ? JSON.stringify(data.settings) : null,
        members: {
          create: {
            wallet,
            role: MemberRole.OWNER,
          },
        },
      },
    });

    await createAuditLog({
      orgId: org.id,
      actorWallet: wallet,
      action: AuditActions.CREATE_ORG,
      entityType: 'Org',
      entityId: org.id,
      metadata: { orgIdHex: data.orgIdHex, name: data.name },
    });

    return res.status(201).json(org);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create org error:', error);
    return res.status(500).json({ error: 'Failed to create organization' });
  }
});

router.get('/', requireWallet, async (req: AuthenticatedRequest, res) => {
  try {
    const wallet = req.wallet!;

    const orgs = await prisma.org.findMany({
      where: {
        OR: [{ ownerWallet: wallet }, { members: { some: { wallet } } }],
      },
      include: {
        members: {
          where: { wallet },
          select: { role: true },
        },
        _count: {
          select: {
            workers: true,
            payruns: true,
          },
        },
      },
    });

    const result = orgs.map((org) => ({
      ...org,
      role: org.ownerWallet === wallet ? MemberRole.OWNER : org.members[0]?.role,
      members: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error('List orgs error:', error);
    return res.status(500).json({ error: 'Failed to list organizations' });
  }
});

router.get(
  '/:orgId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const org = await prisma.org.findUnique({
        where: { id: req.params.orgId },
        include: {
          members: {
            select: {
              id: true,
              wallet: true,
              role: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              workers: true,
              payruns: true,
              paylinks: true,
            },
          },
        },
      });

      return res.json(org);
    } catch (error) {
      console.error('Get org error:', error);
      return res.status(500).json({ error: 'Failed to get organization' });
    }
  }
);

router.get(
  '/:orgId/stats',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.params.orgId;

      const [
        totalPayruns,
        activePayruns,
        completedPayruns,
        totalWorkers,
        activeWorkers,
        payslipStats,
        paylinkStats,
        recentPayruns,
        completedPayrunsForSum,
      ] = await Promise.all([
        prisma.payrun.count({ where: { orgId } }),
        prisma.payrun.count({
          where: { orgId, status: { in: ['DRAFT', 'READY', 'EXECUTING', 'ACTIVE_CLAIMS'] } },
        }),
        prisma.payrun.count({ where: { orgId, status: 'COMPLETED' } }),
        prisma.worker.count({ where: { orgId } }),
        prisma.worker.count({ where: { orgId, status: 'ACTIVE' } }),
        prisma.payslip.groupBy({
          by: ['status'],
          where: { payrun: { orgId } },
          _count: true,
        }),
        prisma.paylink.groupBy({
          by: ['status'],
          where: { orgId },
          _count: true,
        }),
        prisma.payrun.findMany({
          where: { orgId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            payrunIdHex: true,
            status: true,
            totalPayslips: true,
            paidCount: true,
            claimedCount: true,
            totalAmount: true,
            createdAt: true,
          },
        }),
        prisma.payrun.findMany({
          where: { orgId, status: 'COMPLETED' },
          select: { paidAmount: true },
        }),
      ]);

      const payslipStatusMap = Object.fromEntries(payslipStats.map((s) => [s.status, s._count]));
      const paylinkStatusMap = Object.fromEntries(paylinkStats.map((s) => [s.status, s._count]));

      const pendingClaims = (payslipStatusMap['PENDING'] || 0) + (paylinkStatusMap['ACTIVE'] || 0);
      const totalClaimed = (payslipStatusMap['CLAIMED'] || 0) + (paylinkStatusMap['CLAIMED'] || 0);
      const totalPaid = payslipStatusMap['PAID'] || 0;

      const totalPaidAmount = completedPayrunsForSum.reduce(
        (sum, p) => sum + BigInt(p.paidAmount || '0'),
        0n
      );

      return res.json({
        payruns: {
          total: totalPayruns,
          active: activePayruns,
          completed: completedPayruns,
        },
        workers: {
          total: totalWorkers,
          active: activeWorkers,
        },
        claims: {
          pending: pendingClaims,
          claimed: totalClaimed,
          paid: totalPaid,
        },
        paylinks: {
          active: paylinkStatusMap['ACTIVE'] || 0,
          claimed: paylinkStatusMap['CLAIMED'] || 0,
          expired: paylinkStatusMap['EXPIRED'] || 0,
        },
        financials: {
          totalPaidAmount: totalPaidAmount.toString(),
        },
        recentPayruns,
      });
    } catch (error) {
      console.error('Get org stats error:', error);
      return res.status(500).json({ error: 'Failed to get organization stats' });
    }
  }
);

router.patch(
  '/:orgId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = UpdateOrgSchema.parse(req.body);

      const org = await prisma.org.update({
        where: { id: req.params.orgId },
        data: {
          name: data.name,
          settings: data.settings ? JSON.stringify(data.settings) : undefined,
        },
      });

      await createAuditLog({
        orgId: org.id,
        actorWallet: req.wallet!,
        action: AuditActions.UPDATE_ORG,
        entityType: 'Org',
        entityId: org.id,
        metadata: data,
      });

      return res.json(org);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Update org error:', error);
      return res.status(500).json({ error: 'Failed to update organization' });
    }
  }
);

router.post(
  '/:orgId/members',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = AddMemberSchema.parse(req.body);
      const orgId = req.params.orgId;

      const existingMember = await prisma.orgMember.findUnique({
        where: { orgId_wallet: { orgId, wallet: data.wallet } },
      });

      if (existingMember) {
        return res.status(409).json({ error: 'Member already exists' });
      }

      const member = await prisma.orgMember.create({
        data: {
          orgId,
          wallet: data.wallet,
          role: data.role as MemberRole,
          invitedBy: req.wallet,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: req.wallet!,
        action: AuditActions.ADD_MEMBER,
        entityType: 'OrgMember',
        entityId: member.id,
        metadata: { wallet: data.wallet, role: data.role },
      });

      return res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Add member error:', error);
      return res.status(500).json({ error: 'Failed to add member' });
    }
  }
);

router.patch(
  '/:orgId/members/:memberId',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = UpdateMemberSchema.parse(req.body);

      const member = await prisma.orgMember.update({
        where: { id: req.params.memberId },
        data: { role: data.role as MemberRole },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.UPDATE_MEMBER,
        entityType: 'OrgMember',
        entityId: member.id,
        metadata: { role: data.role },
      });

      return res.json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Update member error:', error);
      return res.status(500).json({ error: 'Failed to update member' });
    }
  }
);

router.delete(
  '/:orgId/members/:memberId',
  requireWallet,
  requireOrg([MemberRole.OWNER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const member = await prisma.orgMember.findUnique({
        where: { id: req.params.memberId },
      });

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      if (member.role === MemberRole.OWNER) {
        return res.status(400).json({ error: 'Cannot remove owner' });
      }

      await prisma.orgMember.delete({
        where: { id: req.params.memberId },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.REMOVE_MEMBER,
        entityType: 'OrgMember',
        entityId: member.id,
        metadata: { wallet: member.wallet },
      });

      return res.status(204).send();
    } catch (error) {
      console.error('Remove member error:', error);
      return res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);

export default router;
