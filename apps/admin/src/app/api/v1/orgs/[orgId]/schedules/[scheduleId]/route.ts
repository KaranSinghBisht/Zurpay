import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const UpdateScheduleSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
    workerIds: z.array(z.string()).optional(),
    autoApprove: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    claimDeadlineDays: z.number().min(1).max(90).optional(),
});

// GET /api/v1/orgs/[orgId]/schedules/[scheduleId]
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; scheduleId: string }> }
) {
    const { orgId, scheduleId } = await params;
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
        const schedule = await prisma.recurringSchedule.findFirst({
            where: { id: scheduleId, orgId },
        });

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        return NextResponse.json(schedule);
    } catch (error) {
        console.error('Get schedule error:', error);
        return NextResponse.json({ error: 'Failed to get schedule' }, { status: 500 });
    }
}

// PATCH /api/v1/orgs/[orgId]/schedules/[scheduleId]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; scheduleId: string }> }
) {
    const { orgId, scheduleId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const body = await request.json();
        const data = UpdateScheduleSchema.parse(body);

        const existingSchedule = await prisma.recurringSchedule.findFirst({
            where: { id: scheduleId, orgId },
        });

        if (!existingSchedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        const schedule = await prisma.recurringSchedule.update({
            where: { id: scheduleId },
            data: {
                name: data.name,
                status: data.status,
                workerIds: data.workerIds,
                autoApprove: data.autoApprove,
                requiresApproval: data.requiresApproval,
                claimDeadlineDays: data.claimDeadlineDays,
            },
        });

        return NextResponse.json(schedule);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Update schedule error:', error);
        return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }
}

// DELETE /api/v1/orgs/[orgId]/schedules/[scheduleId]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; scheduleId: string }> }
) {
    const { orgId, scheduleId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const existingSchedule = await prisma.recurringSchedule.findFirst({
            where: { id: scheduleId, orgId },
        });

        if (!existingSchedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
        }

        await prisma.recurringSchedule.update({
            where: { id: scheduleId },
            data: { status: 'CANCELLED' },
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Delete schedule error:', error);
        return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
    }
}
