import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const tokenHash = hashToken(token);

    const claimToken = await prisma.claimToken.findUnique({
      where: { tokenHash },
      include: {
        payslip: {
          include: {
            payrun: {
              include: {
                org: true,
              },
            },
          },
        },
      },
    });

    if (!claimToken) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claimToken.usedAt) {
      return NextResponse.json({ error: 'Claim already used' }, { status: 410 });
    }

    if (claimToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Claim expired' }, { status: 410 });
    }

    if (claimToken.claimPackageJson) {
      const claimPackage = JSON.parse(claimToken.claimPackageJson);
      return NextResponse.json({ type: 'legacy', claimPackage });
    }

    if (claimToken.employeeSecretEnc && claimToken.merklePathJson) {
      const payrun = claimToken.payslip?.payrun;
      const org = payrun?.org;

      if (!payrun || !org) {
        return NextResponse.json({ error: 'Payrun data not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'privacy-preserving',
        requiresAuth: !!claimToken.expectedEmail,
        expectedEmail: claimToken.expectedEmail,
        expiresAt: claimToken.expiresAt,
        payrunId: claimToken.payrunId,
        orgIdHex: org.orgIdHex,
        payrunIdHex: payrun.payrunIdHex,
        merkleRootHex: payrun.merkleRootHex,
        zkVerifierProgramId: org.zkVerifierProgramId,
        incoProgramId: org.incoProgramId,
      });
    }

    return NextResponse.json({ error: 'Claim data incomplete' }, { status: 500 });
  } catch (error) {
    console.error('Get claim package error:', error);
    return NextResponse.json({ error: 'Failed to get claim package' }, { status: 500 });
  }
}
