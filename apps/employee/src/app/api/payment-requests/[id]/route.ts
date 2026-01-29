import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function formatAmountDisplay(amount: string, currency: string): string {
  const num = BigInt(amount);
  const decimals = currency === 'USDC' ? 6 : 9;
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole}.${fractionStr} ${currency}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (paymentRequest.status === 'PAID') {
      return NextResponse.json(
        {
          error: 'Already paid',
          paidBy: paymentRequest.paidBy,
          paidAt: paymentRequest.paidAt?.toISOString(),
          txSig: paymentRequest.payoutTxSig,
        },
        { status: 410 }
      );
    }

    if (paymentRequest.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Request cancelled' }, { status: 410 });
    }

    if (
      paymentRequest.status === 'EXPIRED' ||
      (paymentRequest.expiresAt && paymentRequest.expiresAt < new Date())
    ) {
      if (paymentRequest.status !== 'EXPIRED') {
        await prisma.paymentRequest.update({
          where: { id },
          data: { status: 'EXPIRED' },
        });
      }
      return NextResponse.json({ error: 'Request expired' }, { status: 410 });
    }

    return NextResponse.json({
      id: paymentRequest.id,
      recipientWallet: paymentRequest.recipientWallet,
      recipientConfAccount: paymentRequest.recipientConfAccount,
      amount: paymentRequest.amount,
      amountDisplay: formatAmountDisplay(paymentRequest.amount, paymentRequest.currency),
      currency: paymentRequest.currency,
      memo: paymentRequest.memo,
      expiresAt: paymentRequest.expiresAt?.toISOString(),
      createdAt: paymentRequest.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Get payment request error:', error);
    return NextResponse.json({ error: 'Failed to get payment request' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (paymentRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot cancel ${paymentRequest.status} request` },
        { status: 400 }
      );
    }

    await prisma.paymentRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel payment request error:', error);
    return NextResponse.json({ error: 'Failed to cancel payment request' }, { status: 500 });
  }
}
