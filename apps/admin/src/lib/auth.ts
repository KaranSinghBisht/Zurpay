import { SignJWT, jwtVerify } from 'jose';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { NextRequest } from 'next/server';
import { prisma, MemberRole } from './db';

// =============================================================================
// SIWS (Sign-In With Solana) Types
// =============================================================================

export interface SIWSMessage {
    domain: string;
    address: string;
    statement: string;
    uri: string;
    version: string;
    chainId: string;
    nonce: string;
    issuedAt: string;
    expirationTime?: string;
    notBefore?: string;
    requestId?: string;
    resources?: string[];
}

export interface SIWSVerifyRequest {
    message: SIWSMessage;
    signature: string;
}

// =============================================================================
// JWT Configuration
// =============================================================================

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER || 'zurpay';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'zurpay';

function getJwtSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return new TextEncoder().encode(secret);
}

// =============================================================================
// Auth Functions
// =============================================================================

export function generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function verifySignature(message: string, signature: string, address: string): boolean {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(address);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

export async function createJWT(wallet: string): Promise<string> {
    return await new SignJWT({ wallet })
        .setProtectedHeader({ alg: JWT_ALGORITHM })
        .setIssuedAt()
        .setExpirationTime('24h')
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .sign(getJwtSecret());
}

export async function verifyJWT(token: string): Promise<{ wallet: string } | null> {
    try {
        console.log('[verifyJWT] Verifying token:', token.slice(0, 30) + '...');
        const { payload } = await jwtVerify(token, getJwtSecret(), {
            algorithms: [JWT_ALGORITHM],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });

        console.log('[verifyJWT] Token valid, wallet:', payload.wallet);
        return { wallet: payload.wallet as string };
    } catch (error) {
        console.error('[verifyJWT] JWT verification error:', error);
        return null;
    }
}

export function formatSIWSMessage(message: SIWSMessage): string {
    return `${message.domain} wants you to sign in with your Solana account:\n${message.address}\n\n${message.statement}\n\nURI: ${message.uri}\nVersion: ${message.version}\nChain ID: ${message.chainId}\nNonce: ${message.nonce}\nIssued At: ${message.issuedAt}${message.expirationTime ? `\nExpiration Time: ${message.expirationTime}` : ''}${message.notBefore ? `\nNot Before: ${message.notBefore}` : ''}`;
}

// =============================================================================
// Middleware Helpers
// =============================================================================

export async function getAuthenticatedWallet(request: NextRequest): Promise<string | null> {
    const authHeader = request.headers.get('authorization');
    console.log('[getAuthenticatedWallet] Auth header:', authHeader ? `${authHeader.slice(0, 30)}...` : 'null');

    if (!authHeader?.startsWith('Bearer ')) {
        console.log('[getAuthenticatedWallet] No Bearer token found');
        return null;
    }

    const token = authHeader.substring(7);
    const result = await verifyJWT(token);
    console.log('[getAuthenticatedWallet] Verification result:', result);
    return result?.wallet || null;
}

export async function requireAuth(request: NextRequest): Promise<{ wallet: string } | Response> {
    const wallet = await getAuthenticatedWallet(request);
    if (!wallet) {
        console.log('[requireAuth] No wallet found, returning 401');
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[requireAuth] Authenticated wallet:', wallet);
    return { wallet };
}

export async function requireOrgAccess(
    wallet: string,
    orgId: string,
    allowedRoles: MemberRole[]
): Promise<{ org: Awaited<ReturnType<typeof prisma.org.findUnique>> } | Response> {
    const org = await prisma.org.findUnique({
        where: { id: orgId },
        include: {
            members: {
                where: { wallet },
                select: { role: true },
            },
        },
    });

    if (!org) {
        return Response.json({ error: 'Organization not found' }, { status: 404 });
    }

    const isOwner = org.ownerWallet === wallet;
    const memberRole = org.members[0]?.role;

    if (!isOwner && (!memberRole || !allowedRoles.includes(memberRole))) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return { org };
}
