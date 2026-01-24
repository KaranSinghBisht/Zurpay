import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const InviteWorkerSchema = z.object({
  email: z.string().email(),
  type: z.enum(['EMPLOYEE', 'CONTRACTOR']).default('EMPLOYEE'),
  displayName: z.string().optional(),
  externalId: z.string().optional(),
  rateAmount: z.string().optional(),
  currency: z.string().default('USDC'),
  schedule: z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'AD_HOC']).default('MONTHLY'),
});

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
    const data = InviteWorkerSchema.parse(body);

    const existingWorker = await prisma.worker.findUnique({
      where: { orgId_email: { orgId, email: data.email } },
    });

    if (existingWorker) {
      return NextResponse.json({ error: 'Worker with this email already exists' }, { status: 409 });
    }

    const inviteToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const worker = await prisma.worker.create({
      data: {
        orgId,
        email: data.email,
        type: data.type,
        status: 'INVITED',
        displayName: data.displayName,
        externalId: data.externalId,
        invite: {
          create: {
            token: inviteToken,
            expiresAt,
          },
        },
        ...(data.rateAmount && {
          compPlans: {
            create: {
              rateAmount: data.rateAmount,
              currency: data.currency,
              schedule: data.schedule,
            },
          },
        }),
      },
      include: {
        invite: true,
        compPlans: true,
      },
    });

    const employeeAppUrl = process.env.NEXT_PUBLIC_EMPLOYEE_APP_URL || 'http://localhost:3002';
    const inviteUrl = `${employeeAppUrl}/invite/${inviteToken}`;

    return NextResponse.json(
      {
        worker,
        inviteUrl,
        expiresAt,
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
    console.error('Invite worker error:', error);
    return NextResponse.json({ error: 'Failed to invite worker' }, { status: 500 });
  }
}
