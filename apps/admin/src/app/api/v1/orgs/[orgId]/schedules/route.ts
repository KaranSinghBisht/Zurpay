import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const CreateScheduleSchema = z.object({
    name: z.string().min(1).max(100),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']),
    dayOfWeek: z.number().min(0).max(6).optional(),
    dayOfMonth: z.number().min(1).max(31).optional(),
    secondDayOfMonth: z.number().min(1).max(31).optional(),
    workerIds: z.array(z.string()).optional(),
    autoApprove: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    claimDeadlineDays: z.number().min(1).max(90).optional(),
});

function calculateNextRunDate(
    frequency: string,
    dayOfWeek?: number | null,
    dayOfMonth?: number | null
): Date {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
        case 'WEEKLY':
            if (dayOfWeek !== undefined && dayOfWeek !== null) {
                const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
                next.setDate(now.getDate() + daysUntil);
            } else {
                next.setDate(now.getDate() + 7);
            }
            break;
        case 'BIWEEKLY':
            if (dayOfWeek !== undefined && dayOfWeek !== null) {
                const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
                next.setDate(now.getDate() + daysUntil + 7);
            } else {
                next.setDate(now.getDate() + 14);
            }
            break;
        case 'MONTHLY':
            if (dayOfMonth !== undefined && dayOfMonth !== null) {
                next.setMonth(now.getMonth() + 1);
                next.setDate(dayOfMonth);
            } else {
                next.setMonth(now.getMonth() + 1);
            }
            break;
        case 'SEMIMONTHLY':
            if (now.getDate() < 15) {
                next.setDate(15);
            } else {
                next.setMonth(now.getMonth() + 1);
                next.setDate(1);
            }
            break;
    }

    return next;
}

// GET /api/v1/orgs/[orgId]/schedules - List schedules
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
        const schedules = await prisma.recurringSchedule.findMany({
            where: { orgId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(schedules);
    } catch (error) {
        console.error('List schedules error:', error);
        return NextResponse.json({ error: 'Failed to list schedules' }, { status: 500 });
    }
}

// POST /api/v1/orgs/[orgId]/schedules - Create schedule
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
        const data = CreateScheduleSchema.parse(body);

        const nextRunAt = calculateNextRunDate(data.frequency, data.dayOfWeek, data.dayOfMonth);

        const schedule = await prisma.recurringSchedule.create({
            data: {
                orgId,
                name: data.name,
                frequency: data.frequency,
                dayOfWeek: data.dayOfWeek,
                dayOfMonth: data.dayOfMonth,
                secondDayOfMonth: data.secondDayOfMonth,
                workerIds: data.workerIds || [],
                autoApprove: data.autoApprove || false,
                requiresApproval: data.requiresApproval ?? true,
                claimDeadlineDays: data.claimDeadlineDays || 30,
                nextRunAt,
                createdBy: wallet,
            },
        });

        return NextResponse.json(schedule, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Create schedule error:', error);
        return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }
}
