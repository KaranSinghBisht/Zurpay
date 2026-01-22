import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const UpdateMultisigSchema = z.object({
    multisigPda: z.string(),
    vaultPda: z.string(),
    createKey: z.string(),
    threshold: z.number().min(1),
});

// GET /api/v1/orgs/[orgId]/multisig - Get multisig config
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
        const org = await prisma.org.findUnique({
            where: { id: orgId },
            select: {
                multisigEnabled: true,
                multisigPda: true,
                multisigVaultPda: true,
                multisigCreateKey: true,
                multisigThreshold: true,
            },
        });

        return NextResponse.json({
            enabled: org?.multisigEnabled || false,
            multisigPda: org?.multisigPda,
            vaultPda: org?.multisigVaultPda,
            createKey: org?.multisigCreateKey,
            threshold: org?.multisigThreshold,
        });
    } catch (error) {
        console.error('Get multisig config error:', error);
        return NextResponse.json({ error: 'Failed to get multisig configuration' }, { status: 500 });
    }
}

// POST /api/v1/orgs/[orgId]/multisig/confirm - Confirm multisig setup
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
        const body = await request.json();
        const data = UpdateMultisigSchema.parse(body);

        const org = await prisma.org.update({
            where: { id: orgId },
            data: {
                multisigEnabled: true,
                multisigPda: data.multisigPda,
                multisigVaultPda: data.vaultPda,
                multisigCreateKey: data.createKey,
                multisigThreshold: data.threshold,
            },
        });

        return NextResponse.json({
            success: true,
            multisigPda: org.multisigPda,
            vaultPda: org.multisigVaultPda,
            threshold: org.multisigThreshold,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Confirm multisig error:', error);
        return NextResponse.json({ error: 'Failed to confirm multisig configuration' }, { status: 500 });
    }
}
