import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { Connection, PublicKey } from '@solana/web3.js';

const PayRequestSchema = z.object({
  payerWallet: z.string().min(32).max(44),
  txSig: z.string(),
});

function getSolanaRpcUrl(): string {
  const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (heliusApiKey) {
    return `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
}

async function verifyTransaction(txSig: string, expectedSigner: string): Promise<boolean> {
  try {
    const connection = new Connection(getSolanaRpcUrl(), 'confirmed');
    const tx = await connection.getTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return false;
    }

    const message = tx.transaction.message as any;
    const keys: PublicKey[] =
      typeof message.getAccountKeys === 'function'
        ? message.getAccountKeys().staticAccountKeys
        : message.accountKeys || [];

    const signerCount = message.header?.numRequiredSignatures ?? 0;
    const signerKeys = keys.slice(0, signerCount);
    return signerKeys.some((key) => key.toBase58() === expectedSigner);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const data = PayRequestSchema.parse(body);

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (paymentRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Request is ${paymentRequest.status.toLowerCase()}` },
        { status: 410 }
      );
    }

    if (paymentRequest.expiresAt && paymentRequest.expiresAt < new Date()) {
      await prisma.paymentRequest.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json({ error: 'Request expired' }, { status: 410 });
    }

    const isValidTx = await verifyTransaction(data.txSig, data.payerWallet);
    if (!isValidTx) {
      return NextResponse.json({ error: 'Invalid transaction signature' }, { status: 400 });
    }

    await prisma.paymentRequest.update({
      where: { id },
      data: {
        status: 'PAID',
        paidBy: data.payerWallet,
        paidAt: new Date(),
        payoutTxSig: data.txSig,
      },
    });

    return NextResponse.json({
      success: true,
      txSig: data.txSig,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Pay request error:', error);
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
  }
}
