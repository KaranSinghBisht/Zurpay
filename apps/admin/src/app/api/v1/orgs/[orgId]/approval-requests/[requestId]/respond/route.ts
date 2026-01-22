import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const ApprovalResponseSchema = z.object({
    approved: z.boolean(),
    comments: z.string().optional(),
});

// POST /api/v1/orgs/[orgId]/approval-requests/[requestId]/respond
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string; requestId: string }> }
) {
    const { orgId, requestId } = await params;
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;
    const { wallet } = authResult;

    const accessResult = await requireOrgAccess(wallet, orgId, [
        MemberRole.OWNER,
        MemberRole.APPROVER,
        MemberRole.TREASURER,
    ]);
    if (accessResult instanceof Response) return accessResult;

    try {
        const body = await request.json();
        const data = ApprovalResponseSchema.parse(body);

        const approvalRequest = await prisma.approvalRequest.findFirst({
            where: { id: requestId },
            include: { payrun: true },
        });

        if (!approvalRequest) {
            return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
        }

        if (approvalRequest.payrun.orgId !== orgId) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        if (approvalRequest.status !== 'PENDING') {
            return NextResponse.json({ error: 'Request already responded' }, { status: 400 });
        }

        const newStatus = data.approved ? 'APPROVED' : 'REJECTED';

        const payrunUpdate = data.approved
            ? {
                status: 'READY' as const,
                approvedBy: wallet,
                approvedAt: new Date(),
            }
            : {
                status: 'DRAFT' as const,
                rejectedBy: wallet,
                rejectedAt: new Date(),
                rejectionReason: data.comments,
            };

        const [updatedRequest, updatedPayrun] = await prisma.$transaction([
            prisma.approvalRequest.update({
                where: { id: requestId },
                data: {
                    status: newStatus,
                    respondedBy: wallet,
                    respondedAt: new Date(),
                    comments: data.comments,
                },
            }),
            prisma.payrun.update({
                where: { id: approvalRequest.payrunId },
                data: payrunUpdate,
            }),
        ]);

        return NextResponse.json({
            approvalRequest: updatedRequest,
            payrun: updatedPayrun,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Respond to approval error:', error);
        return NextResponse.json({ error: 'Failed to respond to approval request' }, { status: 500 });
    }
}
