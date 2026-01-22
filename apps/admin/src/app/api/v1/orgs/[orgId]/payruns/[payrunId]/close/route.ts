import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// POST /api/v1/orgs/[orgId]/payruns/[payrunId]/close - Close payrun
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; payrunId: string }> }
) {
    const { orgId, payrunId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const payrun = await prisma.payrun.findUnique({
            where: { id: payrunId },
        });

        if (!payrun || payrun.orgId !== orgId) {
            return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
        }

        await prisma.payrun.update({
            where: { id: payrunId },
            data: {
                status: 'CLOSED',
                closedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Close payrun error:', error);
        return NextResponse.json({ error: 'Failed to close payrun' }, { status: 500 });
    }
}
