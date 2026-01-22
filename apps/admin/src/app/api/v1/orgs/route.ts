import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

const publicKeyString = z.string().refine(isValidPublicKey, {
  message: 'Invalid Solana public key',
});

const CreateOrgSchema = z.object({
  orgIdHex: z.string().length(64),
  name: z.string().min(1).max(100),
  treasuryConfAccount: publicKeyString,
  zkVerifierProgramId: publicKeyString,
  incoProgramId: publicKeyString,
  settings: z.record(z.unknown()).optional(),
});

// GET /api/v1/orgs - List orgs for current user
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const { wallet } = authResult;

  try {
    const orgs = await prisma.org.findMany({
      where: {
        OR: [{ ownerWallet: wallet }, { members: { some: { wallet } } }],
      },
      include: {
        members: {
          where: { wallet },
          select: { role: true },
        },
        _count: {
          select: {
            workers: true,
            payruns: true,
          },
        },
      },
    });

    const result = orgs.map((org) => ({
      ...org,
      role: org.ownerWallet === wallet ? MemberRole.OWNER : org.members[0]?.role,
      members: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('List orgs error:', error);
    return NextResponse.json({ error: 'Failed to list organizations' }, { status: 500 });
  }
}

// POST /api/v1/orgs - Create new org
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const { wallet } = authResult;

  try {
    const body = await request.json();
    const data = CreateOrgSchema.parse(body);

    const existingOrg = await prisma.org.findUnique({
      where: { orgIdHex: data.orgIdHex },
    });

    if (existingOrg) {
      return NextResponse.json(
        { error: 'Organization with this ID already exists' },
        { status: 409 }
      );
    }

    const org = await prisma.org.create({
      data: {
        orgIdHex: data.orgIdHex,
        name: data.name,
        ownerWallet: wallet,
        treasuryConfAccount: data.treasuryConfAccount,
        zkVerifierProgramId: data.zkVerifierProgramId,
        incoProgramId: data.incoProgramId,
        settings: data.settings ? JSON.stringify(data.settings) : null,
        members: {
          create: {
            wallet,
            role: MemberRole.OWNER,
          },
        },
      },
    });

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Create org error:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
