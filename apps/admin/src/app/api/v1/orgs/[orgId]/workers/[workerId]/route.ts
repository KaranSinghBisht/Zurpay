import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const UpdateWorkerSchema = z.object({
    claimerConfAccount: z.string().optional(),
    type: z.enum(['EMPLOYEE', 'CONTRACTOR']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    displayName: z.string().optional(),
    email: z.string().email().optional(),
    externalId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional(),
});

// GET /api/v1/orgs/[orgId]/workers/[workerId] - Get worker details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; workerId: string }> }
) {
    const { orgId, workerId } = await params;
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
        const worker = await prisma.worker.findUnique({
            where: { id: workerId },
            include: {
                compPlans: { orderBy: { effectiveFrom: 'desc' } },
                payslips: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        paidAt: true,
                        claimedAt: true,
                    },
                },
            },
        });

        if (!worker || worker.orgId !== orgId) {
            return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
        }

        return NextResponse.json(worker);
    } catch (error) {
        console.error('Get worker error:', error);
        return NextResponse.json({ error: 'Failed to get worker' }, { status: 500 });
    }
}

// PATCH /api/v1/orgs/[orgId]/workers/[workerId] - Update worker
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; workerId: string }> }
) {
    const { orgId, workerId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const body = await request.json();
        const data = UpdateWorkerSchema.parse(body);

        const existingWorker = await prisma.worker.findUnique({
            where: { id: workerId },
        });

        if (!existingWorker || existingWorker.orgId !== orgId) {
            return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
        }

        const worker = await prisma.worker.update({
            where: { id: workerId },
            data: {
                claimerConfAccount: data.claimerConfAccount,
                type: data.type,
                status: data.status,
                displayName: data.displayName,
                email: data.email,
                externalId: data.externalId,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
            },
        });

        return NextResponse.json(worker);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Update worker error:', error);
        return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
    }
}
