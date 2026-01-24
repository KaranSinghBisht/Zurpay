import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const invite = await prisma.workerInvite.findUnique({
      where: { token },
      include: {
        worker: true,
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

    if (session.user.email.toLowerCase() !== invite.worker.email?.toLowerCase()) {
      return NextResponse.json({ error: 'Email does not match invite' }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.workerInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
      prisma.worker.update({
        where: { id: invite.workerId },
        data: {
          status: 'ACTIVE',
          googleId: (session.user as { googleId?: string }).googleId,
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
  }
}
