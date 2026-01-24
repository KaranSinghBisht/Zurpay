import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

// GET /api/v1/orgs/[orgId]/payruns/[payrunId] - Get payrun details
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
    const payrun = await prisma.payrun.findUnique({
      where: { id: payrunId },
      include: {
        payslips: {
          include: {
            worker: {
              select: {
                id: true,
                email: true,
                wallet: true,
                displayName: true,
                type: true,
              },
            },
            claimTokens: {
              where: {
                usedAt: null,
              },
              select: {
                id: true,
                tokenHash: true,
                expiresAt: true,
              },
            },
          },
        },
      },
    });

    if (!payrun || payrun.orgId !== orgId) {
      return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
    }

    const claimLinks = payrun.payslips
      .filter((ps) => ps.claimTokens.length > 0)
      .map((ps) => ({
        payslipId: ps.id,
        email: ps.worker?.email || '',
        displayName: ps.worker?.displayName || '',
        hasActiveToken: ps.claimTokens.length > 0,
        expiresAt: ps.claimTokens[0]?.expiresAt,
      }));

    return NextResponse.json({
      ...payrun,
      claimLinks,
    });
  } catch (error) {
    console.error('Get payrun error:', error);
    return NextResponse.json({ error: 'Failed to get payrun' }, { status: 500 });
  }
}
