import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const SubmitForApprovalSchema = z.object({
    comments: z.string().optional(),
});

// POST /api/v1/orgs/[orgId]/payruns/[payrunId]/submit-for-approval
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
        const data = SubmitForApprovalSchema.parse(body);

        const payrun = await prisma.payrun.findFirst({
            where: { id: payrunId, orgId },
        });

        if (!payrun) {
            return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
        }

        if (payrun.status !== 'DRAFT') {
            return NextResponse.json({
                error: `Cannot submit payrun with status ${payrun.status} for approval`,
            }, { status: 400 });
        }

        const [updatedPayrun, approvalRequest] = await prisma.$transaction([
            prisma.payrun.update({
                where: { id: payrunId },
                data: {
                    status: 'PENDING_APPROVAL',
                    requiresApproval: true,
                },
            }),
            prisma.approvalRequest.create({
                data: {
                    payrunId,
                    requestedBy: wallet,
                    comments: data.comments,
                },
            }),
        ]);

        return NextResponse.json({ payrun: updatedPayrun, approvalRequest });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error('Submit for approval error:', error);
        return NextResponse.json({ error: 'Failed to submit for approval' }, { status: 500 });
    }
}
