import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';
import { encryptAmountForInco, hashToken, encryptToken } from '@/lib/crypto';

const CreatePaylinkSchema = z.object({
  amount: z.string(),
  currency: z.string().default('USDC'),
  recipientWallet: z.string().optional(),
  recipientConfAccount: z.string().optional(),
  expiresAt: z.string().datetime(),
  memo: z.string().optional(),
});

// GET /api/v1/orgs/[orgId]/paylinks - List paylinks
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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const paylinks = await prisma.paylink.findMany({
      where: {
        orgId,
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return NextResponse.json(paylinks);
  } catch (error) {
    console.error('List paylinks error:', error);
    return NextResponse.json({ error: 'Failed to list paylinks' }, { status: 500 });
  }
}

// POST /api/v1/orgs/[orgId]/paylinks - Create paylink
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const { wallet } = authResult;

  const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
  if (accessResult instanceof Response) return accessResult;

  try {
    const body = await request.json();
    const data = CreatePaylinkSchema.parse(body);

    const amountBigInt = BigInt(data.amount);
    const encryptedAmount = await encryptAmountForInco(amountBigInt);

    // Generate claim token
    const token = randomBytes(32).toString('hex');
    const tokenHashValue = hashToken(token);
    const tokenCiphertext = encryptToken(token);

    const paylink = await prisma.paylink.create({
      data: {
        orgId,
        amount: data.amount,
        currency: data.currency,
        recipientWallet: data.recipientWallet,
        recipientConfAccount: data.recipientConfAccount,
        encryptedAmountB64: Buffer.from(encryptedAmount).toString('base64'),
        tokenHash: tokenHashValue,
        tokenCiphertext,
        expiresAt: new Date(data.expiresAt),
        memo: data.memo,
        createdBy: wallet,
      },
    });

    const claimUrl = `/paylinks/${paylink.id}?token=${token}`;

    return NextResponse.json(
      {
        ...paylink,
        claimUrl,
        tokenHash: undefined,
        tokenCiphertext: undefined,
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
    console.error('Create paylink error:', error);
    return NextResponse.json({ error: 'Failed to create paylink' }, { status: 500 });
  }
}
