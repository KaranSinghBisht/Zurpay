import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { ClaimPackageV2 } from './types';
import { prisma } from './db';

/**
 * Token store for managing claim package tokens.
 * Tokens are unguessable, cannot be derived from wallet address, and are single-use.
 *
 * Security improvements:
 * - Stores only token hashes, never actual tokens
 * - Persists to database, not memory
 * - Tokens expire and are cleaned up automatically
 */
export class TokenStore {
  /**
   * Generate a cryptographically random token.
   * 32 bytes = 256 bits of entropy, base64url encoded.
   */
  generateToken(): string {
    const bytes = randomBytes(32);
    return bytes.toString('base64url');
  }

  /**
   * Store a claim package with given token.
   * Stores token hash, never the actual token.
   */
  async store(
    token: string,
    params: {
      claimPackage?: ClaimPackageV2;
      payrunId: string;
      payslipId?: string;
      paylinkId?: string;
      expiresAtUnix: number;
    }
  ): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await prisma.claimToken.create({
      data: {
        tokenHash,
        payrunId: params.payrunId,
        payslipId: params.payslipId,
        paylinkId: params.paylinkId,
        claimPackageJson: params.claimPackage ? JSON.stringify(params.claimPackage) : null,
        expiresAt: new Date(params.expiresAtUnix * 1000),
        issuedAt: new Date(),
      },
    });
  }

  /**
   * Get a claim package by token.
   * Returns null if token doesn't exist, is expired, or has been used.
   */
  async getByToken(token: string): Promise<any | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const claimToken = await prisma.claimToken.findUnique({
      where: { tokenHash },
    });

    if (!claimToken) {
      return null;
    }

    // Check expiration
    if (claimToken.expiresAt && claimToken.expiresAt < new Date()) {
      return null;
    }

    // Check if already used
    if (claimToken.usedAt) {
      return null;
    }

    if (claimToken.claimPackageJson) {
      try {
        return JSON.parse(claimToken.claimPackageJson);
      } catch {
        return null;
      }
    }

    // For payslip tokens, fetch the payslip data
    if (claimToken.payslipId) {
      const payslip = await prisma.payslip.findUnique({
        where: { id: claimToken.payslipId },
        include: { payrun: true },
      });

      if (!payslip) {
        return null;
      }

      return {
        version: 'v2',
        payslipId: payslip.id,
        payrunId: payslip.payrunId,
        amount: payslip.amount,
        salaryCommitmentHex: payslip.salaryCommitmentHex,
        ciphertextHashHex: payslip.ciphertextHashHex,
        nullifierHex: payslip.nullifierHex,
        encryptedAmountB64: payslip.encryptedAmountB64,
      };
    }

    // For paylink tokens, fetch the paylink data
    if (claimToken.paylinkId) {
      const paylink = await prisma.paylink.findUnique({
        where: { id: claimToken.paylinkId },
      });

      if (!paylink) {
        return null;
      }

      return {
        version: 'v2',
        paylinkId: paylink.id,
        orgId: paylink.orgId,
        amount: paylink.amount,
        salaryCommitmentHex: paylink.salaryCommitmentHex,
        ciphertextHashHex: paylink.ciphertextHashHex,
        nullifierHex: paylink.nullifierHex,
        merkleRootHex: paylink.merkleRootHex,
        recipientWallet: paylink.recipientWallet,
        encryptedAmountB64: paylink.encryptedAmountB64,
      };
    }

    return null;
  }

  /**
   * Mark a token as used after successful claim.
   */
  async markUsed(token: string): Promise<boolean> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const result = await prisma.claimToken.updateMany({
      where: {
        tokenHash,
        usedAt: null, // Only mark unused tokens
      },
      data: {
        usedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Check if a token exists and get its status.
   */
  async getStatus(token: string): Promise<{ exists: boolean; used: boolean; expired: boolean }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const claimToken = await prisma.claimToken.findUnique({
      where: { tokenHash },
    });

    if (!claimToken) {
      return { exists: false, used: false, expired: false };
    }

    return {
      exists: true,
      used: claimToken.usedAt ? true : false,
      expired: claimToken.expiresAt < new Date(),
    };
  }

  /**
   * Clean up expired tokens (call periodically in production).
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.claimToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Get count of tokens (for debugging/monitoring).
   */
  async getCount(): Promise<number> {
    return await prisma.claimToken.count();
  }
}

// Singleton instance for service
export const tokenStore = new TokenStore();
