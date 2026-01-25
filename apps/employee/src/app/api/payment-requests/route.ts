import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const CreatePaymentRequestSchema = z.object({
  recipientWallet: z.string().min(32).max(44),
  recipientConfAccount: z.string().min(32).max(44).optional(),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits'),
  currency: z.string().default('USDC'),
  memo: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
  signature: z.string(),
  message: z.string(),
});

function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signatureBase58: string
): boolean {
  try {
    const publicKey = bs58.decode(walletAddress);
    const signature = bs58.decode(signatureBase58);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreatePaymentRequestSchema.parse(body);

    const expectedMessage = `Create Zurpay payment request for ${data.amount} ${data.currency}`;
    if (data.message !== expectedMessage) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
    }

    const isValid = verifyWalletSignature(data.recipientWallet, data.message, data.signature);

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid wallet signature' }, { status: 401 });
    }

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        recipientWallet: data.recipientWallet,
        recipientConfAccount: data.recipientConfAccount,
        amount: data.amount,
        currency: data.currency,
        memo: data.memo,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
    const payUrl = `${baseUrl}/pay/${paymentRequest.id}`;

    return NextResponse.json(
      {
        id: paymentRequest.id,
        payUrl,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        memo: paymentRequest.memo,
        expiresAt: paymentRequest.expiresAt?.toISOString(),
        createdAt: paymentRequest.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Create payment request error:', error);
    return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const status = searchParams.get('status');

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet parameter required' }, { status: 400 });
    }

    const requests = await prisma.paymentRequest.findMany({
      where: {
        recipientWallet: wallet,
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';

    return NextResponse.json(
      requests.map((req) => ({
        id: req.id,
        payUrl: `${baseUrl}/pay/${req.id}`,
        amount: req.amount,
        currency: req.currency,
        memo: req.memo,
        status: req.status,
        paidBy: req.paidBy,
        paidAt: req.paidAt?.toISOString(),
        payoutTxSig: req.payoutTxSig,
        expiresAt: req.expiresAt?.toISOString(),
        createdAt: req.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('List payment requests error:', error);
    return NextResponse.json({ error: 'Failed to list payment requests' }, { status: 500 });
  }
}
