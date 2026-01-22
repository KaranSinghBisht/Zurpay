import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// POST /api/v1/orgs/[orgId]/multisig/disable - Disable multisig
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER]);
    if (accessResult instanceof Response) return accessResult;

    try {
        await prisma.org.update({
            where: { id: orgId },
            data: {
                multisigEnabled: false,
                multisigPda: null,
                multisigVaultPda: null,
                multisigCreateKey: null,
                multisigThreshold: null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Disable multisig error:', error);
        return NextResponse.json({ error: 'Failed to disable multisig' }, { status: 500 });
    }
}
