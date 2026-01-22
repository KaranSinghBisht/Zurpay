import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole, PayrunMode } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';
import { randomBytes } from 'crypto';

const CreatePayrunSchema = z.object({
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    mode: z.enum(['BATCH', 'CLAIMS']).default('CLAIMS'),
    claimDeadline: z.string().datetime().optional(),
    workerIds: z.array(z.string()).optional(),
    notes: z.string().optional(),
});

// GET /api/v1/orgs/[orgId]/payruns - List payruns
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
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        const payruns = await prisma.payrun.findMany({
            where: {
                orgId,
                ...(status && { status: status as any }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });

        return NextResponse.json(payruns);
    } catch (error) {
        console.error('List payruns error:', error);
        return NextResponse.json({ error: 'Failed to list payruns' }, { status: 500 });
    }
}

// POST /api/v1/orgs/[orgId]/payruns - Create payrun
export async function POST(
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
        const data = CreatePayrunSchema.parse(body);

        // Generate unique payrun ID
        const payrunIdHex = randomBytes(32).toString('hex');

        // Get workers to include
        let workers;
        if (data.workerIds && data.workerIds.length > 0) {
            workers = await prisma.worker.findMany({
                where: {
                    id: { in: data.workerIds },
                    orgId,
                    status: 'ACTIVE',
                },
                include: {
                    compPlans: {
                        where: { effectiveTo: null },
                        orderBy: { effectiveFrom: 'desc' },
                        take: 1,
                    },
                },
            });
        } else {
            workers = await prisma.worker.findMany({
                where: { orgId, status: 'ACTIVE' },
                include: {
                    compPlans: {
                        where: { effectiveTo: null },
                        orderBy: { effectiveFrom: 'desc' },
                        take: 1,
                    },
                },
            });
        }

        // Calculate total amount
        let totalAmount = 0n;
        const payslipsData = workers
            .filter((w) => w.compPlans.length > 0)
            .map((worker) => {
                const plan = worker.compPlans[0];
                const amount = BigInt(plan.rateAmount);
                totalAmount += amount;
                return {
                    workerId: worker.id,
                    amount: plan.rateAmount,
                    currency: plan.currency,
                };
            });

        // Create payrun with payslips
        const payrun = await prisma.payrun.create({
            data: {
                orgId,
                payrunIdHex,
                periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
                periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
                mode: data.mode as PayrunMode,
                claimDeadline: data.claimDeadline ? new Date(data.claimDeadline) : undefined,
                createdBy: wallet,
                totalPayslips: payslipsData.length,
                totalAmount: totalAmount.toString(),
                notes: data.notes,
                payslips: {
                    create: payslipsData,
                },
            },
        });

        return NextResponse.json({
            payrunId: payrun.id,
            payrunIdHex: payrun.payrunIdHex,
            totalPayslips: payrun.totalPayslips,
            totalAmount: payrun.totalAmount,
        }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Create payrun error:', error);
        return NextResponse.json({ error: 'Failed to create payrun' }, { status: 500 });
    }
}
