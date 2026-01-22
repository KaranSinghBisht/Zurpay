import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const SetOnChainSchema = z.object({
    txSignature: z.string().min(1),
});

// POST /api/v1/orgs/[orgId]/payruns/[payrunId]/set-onchain - Record on-chain tx
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
        const body = await request.json();
        const data = SetOnChainSchema.parse(body);

        const payrun = await prisma.payrun.findUnique({
            where: { id: payrunId },
        });

        if (!payrun || payrun.orgId !== orgId) {
            return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
        }

        await prisma.payrun.update({
            where: { id: payrunId },
            data: {
                onChainTxSig: data.txSignature,
                executedAt: new Date(),
                executedBy: wallet,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Set on-chain payrun error:', error);
        return NextResponse.json({ error: 'Failed to update on-chain tx' }, { status: 500 });
    }
}
