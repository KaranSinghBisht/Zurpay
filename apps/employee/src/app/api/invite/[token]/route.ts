import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const invite = await prisma.workerInvite.findUnique({
      where: { token },
      include: {
        worker: {
          include: {
            org: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: 'Invite already accepted' }, { status: 410 });
    }

    return NextResponse.json({
      workerEmail: invite.worker.email,
      orgName: invite.worker.org.name,
      displayName: invite.worker.displayName,
      expiresAt: invite.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Get invite error:', error);
    return NextResponse.json({ error: 'Failed to get invite' }, { status: 500 });
  }
}
