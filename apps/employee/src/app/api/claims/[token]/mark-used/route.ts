import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHash } from 'crypto';

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

// POST /api/claims/[token]/mark-used - Mark claim as used (PUBLIC)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    try {
        const { txSignature } = await request.json();

        if (!txSignature) {
            return NextResponse.json({ error: 'Missing txSignature' }, { status: 400 });
        }

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

        // Mark token as used
        await prisma.claimToken.update({
            where: { tokenHash },
            data: { usedAt: new Date() },
        });

        // Update payslip status if linked
        if (claimToken.payslipId) {
            await prisma.payslip.update({
                where: { id: claimToken.payslipId },
                data: {
                    status: 'CLAIMED',
                    claimedAt: new Date(),
                    payoutTxSig: txSignature,
                },
            });

            // Update payrun claimed count
            await prisma.payrun.update({
                where: { id: claimToken.payrunId },
                data: { claimedCount: { increment: 1 } },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Mark claim used error:', error);
        return NextResponse.json({ error: 'Failed to mark token used' }, { status: 500 });
    }
}
