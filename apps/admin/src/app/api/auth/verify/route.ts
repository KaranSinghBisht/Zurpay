import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    SIWSVerifyRequest,
    verifySignature,
    formatSIWSMessage,
    createJWT
} from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { message, signature }: SIWSVerifyRequest = await request.json();

        if (!message || !signature) {
            return NextResponse.json({ error: 'Missing message or signature' }, { status: 400 });
        }

        // Verify message structure
        if (!message.domain || !message.address || !message.nonce || !message.issuedAt) {
            return NextResponse.json({ error: 'Invalid message structure' }, { status: 400 });
        }

        // Check nonce exists and is valid
        const nonceRecord = await prisma.siwsNonce.findUnique({
            where: { nonce: message.nonce },
        });

        if (!nonceRecord) {
            return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 400 });
        }

        if (nonceRecord.usedAt) {
            return NextResponse.json({ error: 'Nonce already used' }, { status: 400 });
        }

        if (nonceRecord.expiresAt < new Date()) {
            return NextResponse.json({ error: 'Message expired' }, { status: 400 });
        }

        if (nonceRecord.wallet !== message.address) {
            return NextResponse.json({ error: 'Nonce wallet mismatch' }, { status: 400 });
        }

        // Verify expiration
        if (message.expirationTime) {
            const expiration = new Date(message.expirationTime);
            if (expiration < new Date()) {
                return NextResponse.json({ error: 'Message expired' }, { status: 400 });
            }
        }

        // Verify signature
        const messageString = formatSIWSMessage(message);
        if (!verifySignature(messageString, signature, message.address)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Mark nonce as used (atomic update)
        const nonceUpdate = await prisma.siwsNonce.updateMany({
            where: { nonce: message.nonce, usedAt: null },
            data: { usedAt: new Date() },
        });

        if (nonceUpdate.count === 0) {
            return NextResponse.json({ error: 'Nonce already used' }, { status: 400 });
        }

        // Create JWT token
        const jwtToken = await createJWT(message.address);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Store session
        await prisma.session.create({
            data: {
                wallet: message.address,
                jwtToken,
                expiresAt,
            },
        });

        // Clean up old sessions
        await prisma.session.deleteMany({
            where: {
                wallet: message.address,
                expiresAt: { lt: new Date() },
            },
        });

        return NextResponse.json({
            token: jwtToken,
            wallet: message.address,
            expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
        console.error('Auth verification error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
