import { Router } from 'express';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { MemberRole } from '../generated/prisma';

const router = Router();

router.get(
  '/:orgId/analytics',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER, MemberRole.AUDITOR]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.params.orgId;

      const [
        totalPayruns,
        completedPayruns,
        totalWorkers,
        activeWorkers,
        payslipsByStatus,
        paylinksByStatus,
        payrunsByMonth,
        completedPayrunsData,
        claimedPayslips,
      ] = await Promise.all([
        prisma.payrun.count({ where: { orgId } }),
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
        prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
          SELECT 
            TO_CHAR("createdAt", 'YYYY-MM') as month,
            COUNT(*) as count
          FROM "Payrun"
          WHERE "orgId" = ${orgId}
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12
        `,
        prisma.payrun.findMany({
          where: { orgId, status: 'COMPLETED' },
          select: {
            paidAmount: true,
            totalPayslips: true,
            paidCount: true,
            claimedCount: true,
          },
        }),
        prisma.payslip.findMany({
          where: {
            payrun: { orgId },
            status: { in: ['CLAIMED', 'PAID'] },
            claimedAt: { not: null },
          },
          select: {
            createdAt: true,
            claimedAt: true,
          },
        }),
      ]);

      const payslipStatusMap = Object.fromEntries(
        payslipsByStatus.map((s) => [s.status, s._count])
      );
      const paylinkStatusMap = Object.fromEntries(
        paylinksByStatus.map((s) => [s.status, s._count])
      );

      const totalPayslips = Object.values(payslipStatusMap).reduce((a, b) => a + b, 0);
      const claimedPayslipsCount =
        (payslipStatusMap['CLAIMED'] || 0) + (payslipStatusMap['PAID'] || 0);
      const pendingPayslips = payslipStatusMap['PENDING'] || 0;

      const totalPaylinks = Object.values(paylinkStatusMap).reduce((a, b) => a + b, 0);
      const claimedPaylinks = paylinkStatusMap['CLAIMED'] || 0;
      const expiredPaylinks = paylinkStatusMap['EXPIRED'] || 0;

      const totalPaidAmount = completedPayrunsData.reduce(
        (sum, p) => sum + BigInt(p.paidAmount || '0'),
        0n
      );

      const claimTimes = claimedPayslips
        .filter((p) => p.claimedAt)
        .map((p) => {
          const created = new Date(p.createdAt).getTime();
          const claimed = new Date(p.claimedAt!).getTime();
          return (claimed - created) / (1000 * 60 * 60);
        });

      const avgClaimTimeHours =
        claimTimes.length > 0 ? claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length : null;

      const payslipClaimRate = totalPayslips > 0 ? (claimedPayslipsCount / totalPayslips) * 100 : 0;

      const paylinkClaimRate = totalPaylinks > 0 ? (claimedPaylinks / totalPaylinks) * 100 : 0;

      const payrunSuccessRate = totalPayruns > 0 ? (completedPayruns / totalPayruns) * 100 : 0;

      return res.json({
        summary: {
          totalPayruns,
          completedPayruns,
          totalWorkers,
          activeWorkers,
          totalDistributed: totalPaidAmount.toString(),
        },
        claims: {
          totalPayslips,
          claimedPayslips: claimedPayslipsCount,
          pendingPayslips,
          payslipClaimRate: Math.round(payslipClaimRate * 10) / 10,
        },
        paylinks: {
          total: totalPaylinks,
          claimed: claimedPaylinks,
          expired: expiredPaylinks,
          active: paylinkStatusMap['ACTIVE'] || 0,
          claimRate: Math.round(paylinkClaimRate * 10) / 10,
        },
        performance: {
          avgClaimTimeHours: avgClaimTimeHours ? Math.round(avgClaimTimeHours * 10) / 10 : null,
          payrunSuccessRate: Math.round(payrunSuccessRate * 10) / 10,
        },
        trends: {
          payrunsByMonth: payrunsByMonth.map((p) => ({
            month: p.month,
            count: Number(p.count),
          })),
        },
        privacy: {
          encryptedTransfers: claimedPayslipsCount + claimedPaylinks,
          zkProofsVerified: claimedPayslipsCount,
        },
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      return res.status(500).json({ error: 'Failed to get analytics' });
    }
  }
);

export default router;
