import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getPayrollBuilderUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PAYROLL_BUILDER_URL ||
    process.env.PAYROLL_BUILDER_URL ||
    'http://localhost:3001'
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { walletAddress, employeeConfAccountAddress } = body;

    if (!walletAddress || !employeeConfAccountAddress) {
      return NextResponse.json(
        { error: 'walletAddress and employeeConfAccountAddress are required' },
        { status: 400 }
      );
    }

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

    if (claimToken.expectedEmail) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: 'Authentication required', requiresAuth: true },
          { status: 401 }
        );
      }
      if (session.user.email.toLowerCase() !== claimToken.expectedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: 'Email mismatch. This claim is for a different email address.' },
          { status: 403 }
        );
      }
    }

    const payrollBuilderUrl = getPayrollBuilderUrl();
    const proofResponse = await fetch(
      `${payrollBuilderUrl}/api/v1/claims/${token}/generate-proof`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          employeeConfAccountAddress,
        }),
      }
    );

    if (!proofResponse.ok) {
      const errorData = await proofResponse.json().catch(() => ({}));
      console.error('Payroll builder proof generation failed:', errorData);
      return NextResponse.json(
        { error: errorData.error || 'Proof generation failed on backend' },
        { status: proofResponse.status }
      );
    }

    const claimPackage = await proofResponse.json();
    return NextResponse.json(claimPackage);
  } catch (error) {
    console.error('Generate proof error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to generate proof: ${message}` }, { status: 500 });
  }
}
