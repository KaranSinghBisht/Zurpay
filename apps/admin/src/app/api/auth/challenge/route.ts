import { NextRequest, NextResponse } from 'next/server';
import bs58 from 'bs58';
import { prisma } from '@/lib/db';
import { generateNonce, SIWSMessage } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { address } = await request.json();

        if (!address) {
            return NextResponse.json({ error: 'Missing address' }, { status: 400 });
        }

        // Validate Solana address format
        try {
            bs58.decode(address);
        } catch {
            return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 });
        }

        const nonce = generateNonce();
        const domain = request.headers.get('host') || 'localhost:3000';
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const uri = `${protocol}://${domain}/api/auth/challenge`;
        const issuedAt = new Date();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const message: SIWSMessage = {
            domain,
            address,
            statement: 'Sign in to Zurpay payroll system',
            uri,
            version: '1',
            chainId: 'devnet',
            nonce,
            issuedAt: issuedAt.toISOString(),
            expirationTime: expiresAt.toISOString(),
        };

        await prisma.siwsNonce.create({
            data: {
                nonce,
                wallet: address,
                domain,
                uri,
                issuedAt,
                expiresAt,
            },
        });

        return NextResponse.json({ message });
    } catch (error) {
        console.error('Auth challenge error:', error);
        return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
    }
}
