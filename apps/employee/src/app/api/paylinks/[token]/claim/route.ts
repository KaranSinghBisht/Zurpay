import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function formatAmount(amount: string): string {
  const num = BigInt(amount);
  const usd = Number(num) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

// GET /api/paylinks/[token]/claim - Get paylink claim info (PUBLIC)
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
                org: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!claimToken) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    if (claimToken.usedAt) {
      return NextResponse.json({ error: 'Claim already used' }, { status: 410 });
    }

    if (claimToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Claim expired' }, { status: 410 });
    }

    const payslip = claimToken.payslip;
    const payrun = payslip?.payrun;
    const org = payrun?.org;

    let claimPackage: Record<string, unknown> = {};
    if (claimToken.claimPackageJson) {
      try {
        claimPackage = JSON.parse(claimToken.claimPackageJson);
      } catch {
        // Ignore parse errors
      }
    }

    return NextResponse.json({
      id: claimToken.id,
      orgName: org?.name || 'Unknown Organization',
      amountDisplay: payslip ? formatAmount(payslip.amount) : 'Unknown',
      currency: 'USD',
      memo: null,
      expiresAt: claimToken.expiresAt.toISOString(),
      salaryCommitmentHex: claimPackage.salaryCommitmentHex || null,
      ciphertextHashHex: claimPackage.ciphertextHashHex || null,
      encryptedAmountB64: claimPackage.encryptedAmountB64 || null,
    });
  } catch (error) {
    console.error('Get paylink info error:', error);
    return NextResponse.json({ error: 'Failed to load paylink' }, { status: 500 });
  }
}

// POST /api/paylinks/[token]/claim - Submit claim (PUBLIC)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { claimerWallet, claimerConfAccount, txSig } = body;

    if (!claimerWallet || !txSig) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tokenHash = hashToken(token);

    const claimToken = await prisma.claimToken.findUnique({
      where: { tokenHash },
      include: {
        payslip: true,
      },
    });

    if (!claimToken) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    if (claimToken.usedAt) {
      return NextResponse.json({ error: 'Claim already used' }, { status: 410 });
    }

    if (claimToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Claim expired' }, { status: 410 });
    }

    // Mark token as used and update payslip
    await prisma.$transaction([
      prisma.claimToken.update({
        where: { id: claimToken.id },
        data: {
          usedAt: new Date(),
        },
      }),
      ...(claimToken.payslipId
        ? [
            prisma.payslip.update({
              where: { id: claimToken.payslipId },
              data: {
                status: 'CLAIMED',
                payoutTxSig: txSig,
                paidAt: new Date(),
                claimedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ success: true, txSig });
  } catch (error) {
    console.error('Claim paylink error:', error);
    return NextResponse.json({ error: 'Failed to process claim' }, { status: 500 });
  }
}
