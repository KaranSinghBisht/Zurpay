import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, PaymentRequestStatus } from '../generated/prisma';

const router = Router();

router.get(
  '/:orgId/payment-requests',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.TREASURER, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, limit = '20', offset = '0' } = req.query;

      const requests = await prisma.paymentRequest.findMany({
        where: {
          orgId: req.params.orgId,
          ...(status && { status: status as PaymentRequestStatus }),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string), 100),
        skip: parseInt(offset as string),
      });

      return res.json(requests);
    } catch (error) {
      console.error('List payment requests error:', error);
      return res.status(500).json({ error: 'Failed to list payment requests' });
    }
  }
);

router.get(
  '/:orgId/payment-requests/:requestId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.TREASURER, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const request = await prisma.paymentRequest.findUnique({
        where: { id: req.params.requestId },
      });

      if (!request || request.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      return res.json(request);
    } catch (error) {
      console.error('Get payment request error:', error);
      return res.status(500).json({ error: 'Failed to get payment request' });
    }
  }
);

const CreatePaymentRequestSchema = z.object({
  recipientWallet: z.string().min(32).max(44),
  recipientConfAccount: z.string().min(32).max(44).optional(),
  recipientEmail: z.string().email().optional(),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits'),
  currency: z.string().default('USDC'),
  memo: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

router.post('/:orgId/payment-requests', requireWallet, async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.params.orgId;
    const data = CreatePaymentRequestSchema.parse(req.body);

    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const worker = await prisma.worker.findFirst({
      where: {
        orgId,
        OR: [{ wallet: req.wallet }, { wallet: data.recipientWallet }],
      },
    });

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        orgId,
        recipientWallet: data.recipientWallet,
        recipientConfAccount: data.recipientConfAccount,
        recipientEmail: data.recipientEmail,
        amount: data.amount,
        currency: data.currency,
        memo: data.memo,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });

    await createAuditLog({
      orgId,
      actorWallet: req.wallet!,
      action: AuditActions.CREATE_PAYMENT_REQUEST,
      entityType: 'PaymentRequest',
      entityId: paymentRequest.id,
      metadata: {
        amount: data.amount,
        currency: data.currency,
        recipientWallet: data.recipientWallet,
        isExistingWorker: !!worker,
      },
    });

    return res.status(201).json(paymentRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Create payment request error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

const ApprovePaymentRequestSchema = z.object({
  txSignature: z.string().optional(),
});

router.post(
  '/:orgId/payment-requests/:requestId/approve',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = ApprovePaymentRequestSchema.parse(req.body);

      const request = await prisma.paymentRequest.findUnique({
        where: { id: req.params.requestId },
      });

      if (!request || request.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      if (request.status !== PaymentRequestStatus.PENDING) {
        return res
          .status(400)
          .json({ error: `Cannot approve request in ${request.status} status` });
      }

      if (request.expiresAt && new Date() > request.expiresAt) {
        await prisma.paymentRequest.update({
          where: { id: request.id },
          data: { status: PaymentRequestStatus.EXPIRED },
        });
        return res.status(400).json({ error: 'Payment request has expired' });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id: req.params.requestId },
        data: {
          status: PaymentRequestStatus.PAID,
          paidBy: req.wallet,
          paidAt: new Date(),
          payoutTxSig: data.txSignature,
        },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.APPROVE_PAYMENT_REQUEST,
        entityType: 'PaymentRequest',
        entityId: request.id,
        metadata: { txSignature: data.txSignature },
      });

      return res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Approve payment request error:', error);
      return res.status(500).json({ error: 'Failed to approve payment request' });
    }
  }
);

const RejectPaymentRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

router.post(
  '/:orgId/payment-requests/:requestId/reject',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.TREASURER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = RejectPaymentRequestSchema.parse(req.body);

      const request = await prisma.paymentRequest.findUnique({
        where: { id: req.params.requestId },
      });

      if (!request || request.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      if (request.status !== PaymentRequestStatus.PENDING) {
        return res.status(400).json({ error: `Cannot reject request in ${request.status} status` });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id: req.params.requestId },
        data: {
          status: PaymentRequestStatus.CANCELLED,
        },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.REJECT_PAYMENT_REQUEST,
        entityType: 'PaymentRequest',
        entityId: request.id,
        metadata: { reason: data.reason },
      });

      return res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Reject payment request error:', error);
      return res.status(500).json({ error: 'Failed to reject payment request' });
    }
  }
);

router.get(
  '/:orgId/payment-requests/stats',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.TREASURER, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.params.orgId;

      const [pending, paid, cancelled, expired] = await Promise.all([
        prisma.paymentRequest.count({
          where: { orgId, status: PaymentRequestStatus.PENDING },
        }),
        prisma.paymentRequest.count({
          where: { orgId, status: PaymentRequestStatus.PAID },
        }),
        prisma.paymentRequest.count({
          where: { orgId, status: PaymentRequestStatus.CANCELLED },
        }),
        prisma.paymentRequest.count({
          where: { orgId, status: PaymentRequestStatus.EXPIRED },
        }),
      ]);

      const pendingRequests = await prisma.paymentRequest.findMany({
        where: { orgId, status: PaymentRequestStatus.PENDING },
        select: { amount: true },
      });

      const pendingAmount = pendingRequests.reduce(
        (sum: bigint, r: { amount: string }) => sum + BigInt(r.amount),
        BigInt(0)
      );

      return res.json({
        pending,
        paid,
        cancelled,
        expired,
        total: pending + paid + cancelled + expired,
        pendingAmount: pendingAmount.toString(),
      });
    } catch (error) {
      console.error('Get payment request stats error:', error);
      return res.status(500).json({ error: 'Failed to get payment request stats' });
    }
  }
);

export default router;
