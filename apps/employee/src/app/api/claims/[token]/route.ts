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

    if (!claimToken.claimPackageJson) {
      return NextResponse.json({ error: 'Claim package not found' }, { status: 404 });
    }

    const claimPackage = JSON.parse(claimToken.claimPackageJson);

    return NextResponse.json(claimPackage);
  } catch (error) {
    console.error('Get claim package error:', error);
    return NextResponse.json({ error: 'Failed to get claim package' }, { status: 500 });
  }
}
