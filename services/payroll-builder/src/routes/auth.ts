import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from '../db';

const router = express.Router();

// =============================================================================
// SIWS (Sign-In With Solana) Implementation
// =============================================================================

interface SIWSMessage {
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

interface SIWSVerifyRequest {
  message: SIWSMessage;
  signature: string;
}

// Generate cryptographically secure nonce
function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

// Verify Solana signature
function verifySignature(message: string, signature: string, address: string): boolean {
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

// =============================================================================
// JWT Token Management
// =============================================================================

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER || 'zurpay';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'zurpay';

async function createJWT(wallet: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);

  const payload = { wallet };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(secret);
}

async function verifyJWT(token: string): Promise<{ wallet: string } | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return { wallet: payload.wallet as string };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// =============================================================================
// Auth Endpoints
// =============================================================================

// POST /auth/challenge - Generate SIWS challenge
router.post('/challenge', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Missing address' });
  }

  // Validate Solana address format
  try {
    bs58.decode(address);
  } catch {
    return res.status(400).json({ error: 'Invalid Solana address' });
  }

  const nonce = generateNonce();
  const domain = req.get('host') || 'localhost:3001';
  const uri = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const message: SIWSMessage = {
    domain,
    address,
    statement: 'Sign in to Zurpay payroll system',
    uri,
    version: '1',
    chainId: 'devnet', // TODO: Make configurable
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(), // 5 minutes
  };

  try {
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

    return res.json({ message });
  } catch (error) {
    console.error('Auth challenge error:', error);
    return res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// POST /auth/verify - Verify SIWS signature and create session
router.post('/verify', async (req, res) => {
  try {
    const { message, signature }: SIWSVerifyRequest = req.body;

    if (!message || !signature) {
      return res.status(400).json({ error: 'Missing message or signature' });
    }

    // Verify message structure
    if (!message.domain || !message.address || !message.nonce || !message.issuedAt) {
      return res.status(400).json({ error: 'Invalid message structure' });
    }

    const nonceRecord = await prisma.siwsNonce.findUnique({
      where: { nonce: message.nonce },
    });

    if (!nonceRecord) {
      return res.status(400).json({ error: 'Invalid or expired nonce' });
    }

    if (nonceRecord.usedAt) {
      return res.status(400).json({ error: 'Nonce already used' });
    }

    if (nonceRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Message expired' });
    }

    if (nonceRecord.wallet !== message.address) {
      return res.status(400).json({ error: 'Nonce wallet mismatch' });
    }

    if (nonceRecord.domain !== message.domain || nonceRecord.uri !== message.uri) {
      return res.status(400).json({ error: 'Message origin mismatch' });
    }

    // Verify expiration
    if (message.expirationTime) {
      const expiration = new Date(message.expirationTime);
      if (expiration < new Date()) {
        return res.status(400).json({ error: 'Message expired' });
      }
    }

    // Verify not before
    if (message.notBefore) {
      const notBefore = new Date(message.notBefore);
      if (notBefore > new Date()) {
        return res.status(400).json({ error: 'Message not yet valid' });
      }
    }

    // Verify signature
    const messageString = `${message.domain} wants you to sign in with your Solana account:\n${message.address}\n\n${message.statement}\n\nURI: ${message.uri}\nVersion: ${message.version}\nChain ID: ${message.chainId}\nNonce: ${message.nonce}\nIssued At: ${message.issuedAt}${message.expirationTime ? `\nExpiration Time: ${message.expirationTime}` : ''}${message.notBefore ? `\nNot Before: ${message.notBefore}` : ''}`;

    if (!verifySignature(messageString, signature, message.address)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const nonceUpdate = await prisma.siwsNonce.updateMany({
      where: { nonce: message.nonce, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (nonceUpdate.count === 0) {
      return res.status(400).json({ error: 'Nonce already used' });
    }

    // Create JWT token
    const jwtToken = await createJWT(message.address);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store session in database
    await prisma.session.create({
      data: {
        wallet: message.address,
        jwtToken,
        expiresAt,
      },
    });

    // Clean up old sessions for this wallet
    await prisma.session.deleteMany({
      where: {
        wallet: message.address,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    res.json({
      token: jwtToken,
      wallet: message.address,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout - Invalidate session
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);

    // Delete session from database
    await prisma.session.deleteMany({
      where: { jwtToken: token },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Export JWT verification for middleware
// =============================================================================

export { verifyJWT };
export default router;
