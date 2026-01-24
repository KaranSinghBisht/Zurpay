import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; payrunId: string }> }
) {
  const { orgId, payrunId } = await params;
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
    const approvalRequests = await prisma.approvalRequest.findMany({
      where: { payrunId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(approvalRequests);
  } catch (error) {
    console.error('Get approval history error:', error);
    return NextResponse.json({ error: 'Failed to get approval history' }, { status: 500 });
  }
}
