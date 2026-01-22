import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// GET /api/v1/orgs/[orgId]/paylinks/[paylinkId] - Get paylink
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; paylinkId: string }> }
) {
    const { orgId, paylinkId } = await params;
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
        const paylink = await prisma.paylink.findUnique({
            where: { id: paylinkId },
        });

        if (!paylink || paylink.orgId !== orgId) {
            return NextResponse.json({ error: 'Paylink not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...paylink,
            tokenHash: undefined,
            tokenCiphertext: undefined,
        });
    } catch (error) {
        console.error('Get paylink error:', error);
        return NextResponse.json({ error: 'Failed to get paylink' }, { status: 500 });
    }
}

// DELETE /api/v1/orgs/[orgId]/paylinks/[paylinkId] - Cancel paylink
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; paylinkId: string }> }
) {
    const { orgId, paylinkId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const paylink = await prisma.paylink.findUnique({
            where: { id: paylinkId },
        });

        if (!paylink || paylink.orgId !== orgId) {
            return NextResponse.json({ error: 'Paylink not found' }, { status: 404 });
        }

        if (paylink.status !== 'ACTIVE') {
            return NextResponse.json({ error: 'Can only cancel active paylinks' }, { status: 400 });
        }

        await prisma.paylink.update({
            where: { id: paylinkId },
            data: { status: 'CANCELLED' },
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Cancel paylink error:', error);
        return NextResponse.json({ error: 'Failed to cancel paylink' }, { status: 500 });
    }
}
