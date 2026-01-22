import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// GET /api/v1/orgs/[orgId]/multisig/proposals - List proposals
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
    ]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const proposals = await prisma.multisigProposal.findMany({
            where: { orgId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json(proposals);
    } catch (error) {
        console.error('List proposals error:', error);
        return NextResponse.json({ error: 'Failed to list proposals' }, { status: 500 });
    }
}
