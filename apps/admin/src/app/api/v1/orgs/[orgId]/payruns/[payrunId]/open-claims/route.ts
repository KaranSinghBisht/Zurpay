import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';
import { sendClaimEmail } from '@/lib/email';

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
    const payrun = await prisma.payrun.findUnique({
      where: { id: payrunId },
      include: {
        org: { select: { name: true } },
        payslips: {
          include: {
            worker: { select: { email: true } },
            claimTokens: {
              where: { usedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!payrun || payrun.orgId !== orgId) {
      return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
    }

    if (payrun.status !== 'READY') {
      return NextResponse.json({ error: 'Payrun must be validated first' }, { status: 400 });
    }

    await prisma.payrun.update({
      where: { id: payrunId },
      data: { status: 'ACTIVE_CLAIMS' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Open claims error:', error);
    return NextResponse.json({ error: 'Failed to open claims' }, { status: 500 });
  }
}
