import { Router } from 'express';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole, LedgerEntryType } from '../generated/prisma';
import { createHash } from 'crypto';

const router = Router();

router.get(
  '/:orgId/payruns/:payrunId/export.csv',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
        include: {
          payslips: {
            include: {
              worker: {
                select: {
                  wallet: true,
                  displayName: true,
                  type: true,
                },
              },
            },
          },
          org: {
            select: { name: true },
          },
        },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      const csvLines: string[] = [];

      csvLines.push('Date,Account,Description,Debit,Credit,Reference');

      const periodStr = payrun.periodEnd
        ? payrun.periodEnd.toISOString().split('T')[0]
        : payrun.createdAt.toISOString().split('T')[0];

      let totalAmount = 0n;

      for (const payslip of payrun.payslips) {
        const amount = BigInt(payslip.amount);
        totalAmount += amount;
        const amountUsd = (Number(amount) / 1_000_000).toFixed(2);
        const workerName =
          payslip.worker.displayName || payslip.worker.wallet?.slice(0, 8) || 'Unknown';

        csvLines.push(
          `${periodStr},Payroll Expense,${workerName} - ${payslip.currency},${amountUsd},,${payslip.payoutTxSig || payslip.id}`
        );
      }

      const totalUsd = (Number(totalAmount) / 1_000_000).toFixed(2);
      csvLines.push(
        `${periodStr},Treasury - ${payrun.payslips[0]?.currency || 'USDC'},Payroll disbursement,,${totalUsd},${payrun.payrunIdHex.slice(0, 16)}`
      );

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.EXPORT_DATA,
        entityType: 'Payrun',
        entityId: payrun.id,
        metadata: { exportType: 'csv' },
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="payrun-${payrun.payrunIdHex.slice(0, 16)}.csv"`
      );
      return res.send(csvLines.join('\n'));
    } catch (error) {
      console.error('Export CSV error:', error);
      return res.status(500).json({ error: 'Failed to export CSV' });
    }
  }
);

router.get(
  '/:orgId/payruns/:payrunId/audit-pack.json',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const payrun = await prisma.payrun.findUnique({
        where: { id: req.params.payrunId },
        include: {
          payslips: {
            select: {
              id: true,
              workerId: true,
              currency: true,
              status: true,
              salaryCommitmentHex: true,
              ciphertextHashHex: true,
              nullifierHex: true,
              payoutTxSig: true,
              paidAt: true,
              claimedAt: true,
              createdAt: true,
            },
          },
          ledgerEntries: {
            select: {
              id: true,
              type: true,
              amount: true,
              currency: true,
              txSig: true,
              description: true,
              createdAt: true,
            },
          },
          org: {
            select: {
              name: true,
              orgIdHex: true,
            },
          },
        },
      });

      if (!payrun || payrun.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Payrun not found' });
      }

      const auditPack = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        organization: {
          name: payrun.org.name,
          orgIdHex: payrun.org.orgIdHex,
        },
        payrun: {
          id: payrun.id,
          payrunIdHex: payrun.payrunIdHex,
          status: payrun.status,
          mode: payrun.mode,
          periodStart: payrun.periodStart,
          periodEnd: payrun.periodEnd,
          merkleRootHex: payrun.merkleRootHex,
          totalPayslips: payrun.totalPayslips,
          paidCount: payrun.paidCount,
          claimedCount: payrun.claimedCount,
          failedCount: payrun.failedCount,
          claimDeadline: payrun.claimDeadline,
          createdBy: payrun.createdBy,
          executedBy: payrun.executedBy,
          executedAt: payrun.executedAt,
          closedAt: payrun.closedAt,
          onChainTxSig: payrun.onChainTxSig,
          createdAt: payrun.createdAt,
        },
        payslips: payrun.payslips,
        ledgerEntries: payrun.ledgerEntries,
        transactionSignatures: payrun.payslips
          .filter((p) => p.payoutTxSig)
          .map((p) => p.payoutTxSig),
      };

      const packJson = JSON.stringify(auditPack, null, 2);
      const checksum = createHash('sha256').update(packJson).digest('hex');

      const response = {
        ...auditPack,
        checksum,
      };

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.EXPORT_DATA,
        entityType: 'Payrun',
        entityId: payrun.id,
        metadata: { exportType: 'audit-pack', checksum },
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-pack-${payrun.payrunIdHex.slice(0, 16)}.json"`
      );
      return res.json(response);
    } catch (error) {
      console.error('Export audit pack error:', error);
      return res.status(500).json({ error: 'Failed to export audit pack' });
    }
  }
);

router.get(
  '/:orgId/ledger',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { type, limit = '50', offset = '0' } = req.query;

      const entries = await prisma.ledgerEntry.findMany({
        where: {
          orgId: req.params.orgId,
          ...(type && { type: type as LedgerEntryType }),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string), 100),
        skip: parseInt(offset as string),
      });

      return res.json(entries);
    } catch (error) {
      console.error('List ledger entries error:', error);
      return res.status(500).json({ error: 'Failed to list ledger entries' });
    }
  }
);

export default router;
