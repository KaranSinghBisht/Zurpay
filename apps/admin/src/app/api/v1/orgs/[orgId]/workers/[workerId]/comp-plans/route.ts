import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const CreateCompPlanSchema = z.object({
    currency: z.string().default('USDC'),
    schedule: z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'AD_HOC']).default('MONTHLY'),
    rateAmount: z.string(),
    effectiveFrom: z.string().datetime().optional(),
    notes: z.string().optional(),
});

// POST /api/v1/orgs/[orgId]/workers/[workerId]/comp-plans - Create comp plan
export async function POST(
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
        const data = CreateCompPlanSchema.parse(body);

        const worker = await prisma.worker.findUnique({
            where: { id: workerId },
        });

        if (!worker || worker.orgId !== orgId) {
            return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
        }

        // End current active plan if exists
        await prisma.compPlan.updateMany({
            where: { workerId, effectiveTo: null },
            data: { effectiveTo: new Date() },
        });

        const compPlan = await prisma.compPlan.create({
            data: {
                workerId,
                currency: data.currency,
                schedule: data.schedule,
                rateAmount: data.rateAmount,
                effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
                notes: data.notes,
            },
        });

        return NextResponse.json(compPlan, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Create comp plan error:', error);
        return NextResponse.json({ error: 'Failed to create compensation plan' }, { status: 500 });
    }
}
