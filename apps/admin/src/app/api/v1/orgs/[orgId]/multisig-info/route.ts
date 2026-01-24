import { NextRequest, NextResponse } from 'next/server';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

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
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: {
        multisigEnabled: true,
        multisigPda: true,
        multisigVaultPda: true,
        multisigThreshold: true,
      },
    });

    return NextResponse.json({
      enabled: org?.multisigEnabled || false,
      multisigPda: org?.multisigPda,
      vaultPda: org?.multisigVaultPda,
      threshold: org?.multisigThreshold,
      state: null,
    });
  } catch (error) {
    console.error('Get multisig info error:', error);
    return NextResponse.json({ error: 'Failed to get multisig info' }, { status: 500 });
  }
}
