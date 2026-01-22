import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// GET /api/v1/orgs/[orgId]/approval-requests - List approval requests
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
        MemberRole.APPROVER,
        MemberRole.TREASURER,
    ]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const requests = await prisma.approvalRequest.findMany({
            where: {
                payrun: { orgId },
                ...(status && { status: status as any }),
            },
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

        return NextResponse.json(requests);
    } catch (error) {
        console.error('List approval requests error:', error);
        return NextResponse.json({ error: 'Failed to list approval requests' }, { status: 500 });
    }
}
