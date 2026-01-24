import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';

const CreateWorkerSchema = z.object({
  email: z.string().email(),
  wallet: z.string().optional(), // Optional - set at claim time for privacy-preserving flow
  type: z.enum(['EMPLOYEE', 'CONTRACTOR']).default('EMPLOYEE'),
  displayName: z.string().optional(),
  externalId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET /api/v1/orgs/[orgId]/workers - List workers
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
    const type = searchParams.get('type');

    const workers = await prisma.worker.findMany({
      where: {
        orgId,
        ...(status && { status: status as 'ACTIVE' | 'INACTIVE' | 'INVITED' }),
        ...(type && { type: type as 'EMPLOYEE' | 'CONTRACTOR' }),
      },
      include: {
        compPlans: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        invite: {
          select: {
            expiresAt: true,
            acceptedAt: true,
          },
        },
        _count: { select: { payslips: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(workers);
  } catch (error) {
    console.error('List workers error:', error);
    return NextResponse.json({ error: 'Failed to list workers' }, { status: 500 });
  }
}

// POST /api/v1/orgs/[orgId]/workers - Create worker
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
    const data = CreateWorkerSchema.parse(body);

    const existingWorker = await prisma.worker.findUnique({
      where: { orgId_email: { orgId, email: data.email } },
    });

    if (existingWorker) {
      return NextResponse.json({ error: 'Worker with this email already exists' }, { status: 409 });
    }

    const worker = await prisma.worker.create({
      data: {
        orgId,
        email: data.email,
        wallet: data.wallet,
        type: data.type,
        displayName: data.displayName,
        externalId: data.externalId,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      },
    });

    return NextResponse.json(worker, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Create worker error:', error);
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
  }
}
