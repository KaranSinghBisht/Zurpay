import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, PayrunStatus, ApprovalRequestStatus } from '../generated/prisma';

const router = Router();

const SubmitForApprovalSchema = z.object({
  comments: z.string().optional(),
});

const ApprovalResponseSchema = z.object({
  approved: z.boolean(),
  comments: z.string().optional(),
});

router.post(
  '/:orgId/payruns/:payrunId/submit-for-approval',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, payrunId } = req.params;
      const data = SubmitForApprovalSchema.parse(req.body);
      const wallet = req.wallet!;

      const payrun = await prisma.payrun.findFirst({
        where: { id: payrunId, orgId },
      });

      if (!payrun) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      if (payrun.status !== PayrunStatus.DRAFT) {
        return res.status(400).json({
          error: `Cannot submit payrun with status ${payrun.status} for approval`,
        });
      }

      const [updatedPayrun, approvalRequest] = await prisma.$transaction([
        prisma.payrun.update({
          where: { id: payrunId },
          data: {
            status: PayrunStatus.PENDING_APPROVAL,
            requiresApproval: true,
          },
        }),
        prisma.approvalRequest.create({
          data: {
            payrunId,
            requestedBy: wallet,
            comments: data.comments,
          },
        }),
      ]);

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.SUBMIT_FOR_APPROVAL,
        entityType: 'Payrun',
        entityId: payrunId,
        metadata: { comments: data.comments },
      });

      return res.json({
        payrun: updatedPayrun,
        approvalRequest,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Submit for approval error:', error);
      return res.status(500).json({ error: 'Failed to submit for approval' });
    }
  }
);

router.get(
  '/:orgId/approval-requests',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.APPROVER, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId } = req.params;
      const status = req.query.status as string | undefined;

      const where: { payrun: { orgId: string }; status?: ApprovalRequestStatus } = {
        payrun: { orgId },
      };

      if (
        status &&
        Object.values(ApprovalRequestStatus).includes(status as ApprovalRequestStatus)
      ) {
        where.status = status as ApprovalRequestStatus;
      }

      const requests = await prisma.approvalRequest.findMany({
        where,
        include: {
          payrun: {
            select: {
              id: true,
              payrunIdHex: true,
              periodStart: true,
              periodEnd: true,
              totalPayslips: true,
              totalAmount: true,
              status: true,
              createdBy: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(requests);
    } catch (error) {
      console.error('List approval requests error:', error);
      return res.status(500).json({ error: 'Failed to list approval requests' });
    }
  }
);

router.post(
  '/:orgId/approval-requests/:requestId/respond',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.APPROVER, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { orgId, requestId } = req.params;
      const data = ApprovalResponseSchema.parse(req.body);
      const wallet = req.wallet!;

      const request = await prisma.approvalRequest.findFirst({
        where: { id: requestId },
        include: { payrun: true },
      });

      if (!request) {
        return res.status(404).json({ error: 'Approval request not found' });
      }

      if (request.payrun.orgId !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (request.status !== ApprovalRequestStatus.PENDING) {
        return res.status(400).json({ error: 'Request already responded' });
      }

      const newStatus = data.approved
        ? ApprovalRequestStatus.APPROVED
        : ApprovalRequestStatus.REJECTED;

      const payrunUpdate = data.approved
        ? {
            status: PayrunStatus.READY,
            approvedBy: wallet,
            approvedAt: new Date(),
          }
        : {
            status: PayrunStatus.DRAFT,
            rejectedBy: wallet,
            rejectedAt: new Date(),
            rejectionReason: data.comments,
          };

      const [updatedRequest, updatedPayrun] = await prisma.$transaction([
        prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: newStatus,
            respondedBy: wallet,
            respondedAt: new Date(),
            comments: data.comments,
          },
        }),
        prisma.payrun.update({
          where: { id: request.payrunId },
          data: payrunUpdate,
        }),
      ]);

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: data.approved ? AuditActions.APPROVE_PAYRUN : AuditActions.REJECT_PAYRUN,
        entityType: 'Payrun',
        entityId: request.payrunId,
        metadata: { comments: data.comments, requestId },
      });

      return res.json({
        approvalRequest: updatedRequest,
        payrun: updatedPayrun,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Respond to approval error:', error);
      return res.status(500).json({ error: 'Failed to respond to approval request' });
    }
  }
);

router.get(
  '/:orgId/payruns/:payrunId/approval-history',
  requireWallet,
  requireOrg([
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.APPROVER,
    MemberRole.TREASURER,
    MemberRole.AUDITOR,
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { payrunId } = req.params;

      const requests = await prisma.approvalRequest.findMany({
        where: { payrunId },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(requests);
    } catch (error) {
      console.error('Get approval history error:', error);
      return res.status(500).json({ error: 'Failed to get approval history' });
    }
  }
);

export default router;
