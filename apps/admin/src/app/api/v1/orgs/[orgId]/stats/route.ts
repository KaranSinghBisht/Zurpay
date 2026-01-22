import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// GET /api/v1/orgs/[orgId]/stats - Get org statistics
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [
        MemberRole.OWNER,
        MemberRole.ADMIN,
        MemberRole.VIEWER,
        MemberRole.AUDITOR,
    ]);
    if (accessResult instanceof Response) return accessResult;

    try {
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

        return NextResponse.json({
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
        return NextResponse.json({ error: 'Failed to get organization stats' }, { status: 500 });
    }
}
