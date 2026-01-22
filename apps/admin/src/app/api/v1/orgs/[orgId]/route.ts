import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const UpdateOrgSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    settings: z.record(z.unknown()).optional(),
});

// GET /api/v1/orgs/[orgId] - Get org details
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
        const org = await prisma.org.findUnique({
            where: { id: orgId },
            include: {
                members: {
                    select: {
                        id: true,
                        wallet: true,
                        role: true,
                        createdAt: true,
                    },
                },
                _count: {
                    select: {
                        workers: true,
                        payruns: true,
                        paylinks: true,
                    },
                },
            },
        });

        return NextResponse.json(org);
    } catch (error) {
        console.error('Get org error:', error);
        return NextResponse.json({ error: 'Failed to get organization' }, { status: 500 });
    }
}

// PATCH /api/v1/orgs/[orgId] - Update org
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const body = await request.json();
        const data = UpdateOrgSchema.parse(body);

        const org = await prisma.org.update({
            where: { id: orgId },
            data: {
                name: data.name,
                settings: data.settings ? JSON.stringify(data.settings) : undefined,
            },
        });

        return NextResponse.json(org);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Update org error:', error);
        return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }
}
