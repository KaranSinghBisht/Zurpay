import { Router } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { emailService } from '../services/email';
import { MemberRole, PaylinkStatus, LedgerEntryType } from '../generated/prisma';
import { computeSalaryCommitment, computeCiphertextHash, bytesToHex } from '@zurpay/sdk';
import { decryptToken, encryptAmountForInco, encryptToken, hashToken } from '../crypto';

const router = Router();

function getSolanaRpcUrl(): string {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (heliusApiKey) {
    return `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }
  return process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
}

const connection = new Connection(getSolanaRpcUrl(), 'confirmed');

async function verifyTxSigner(txSignature: string, wallet: string): Promise<boolean> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) {
      return false;
    }

    const message = tx.transaction.message as any;
    const keys: PublicKey[] =
      typeof message.getAccountKeys === 'function'
        ? message.getAccountKeys().staticAccountKeys
        : message.accountKeys || [];

    const signerCount = message.header?.numRequiredSignatures ?? 0;
    const signerKeys = keys.slice(0, signerCount);
    return signerKeys.some((key) => key.toBase58() === wallet);
  } catch {
    return false;
  }
}

const CreatePaylinkSchema = z.object({
  amount: z.string(),
  currency: z.string().default('USDC'),
  recipientWallet: z.string().optional(),
  recipientConfAccount: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().optional(),
  expiresAt: z.string().datetime(),
  memo: z.string().optional(),
  sendEmail: z.boolean().default(false),
});

router.get(
  '/:orgId/paylinks',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { status, limit = '20', offset = '0' } = req.query;

      const paylinks = await prisma.paylink.findMany({
        where: {
          orgId: req.params.orgId,
          ...(status && { status: status as PaylinkStatus }),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string), 100),
        skip: parseInt(offset as string),
        select: {
          id: true,
          orgId: true,
          amount: true,
          currency: true,
          recipientWallet: true,
          status: true,
          expiresAt: true,
          claimedAt: true,
          memo: true,
          createdAt: true,
          createdBy: true,
          tokenCiphertext: true,
        },
      });

      const baseUrl = process.env.EMPLOYEE_APP_URL || 'http://localhost:3002';
      const response = paylinks.map((paylink) => {
        let claimUrl: string | undefined;
        if (paylink.status === PaylinkStatus.ACTIVE && paylink.tokenCiphertext) {
          try {
            const token = decryptToken(paylink.tokenCiphertext);
            claimUrl = `${baseUrl}/paylinks/${paylink.id}?token=${token}`;
          } catch {
            claimUrl = undefined;
          }
        }
        const { tokenCiphertext, ...rest } = paylink;
        return { ...rest, claimUrl };
      });

      return res.json(response);
    } catch (error) {
      console.error('List paylinks error:', error);
      return res.status(500).json({ error: 'Failed to list paylinks' });
    }
  }
);

router.post(
  '/:orgId/paylinks',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = CreatePaylinkSchema.parse(req.body);
      const orgId = req.params.orgId;

      const amountBigInt = BigInt(data.amount);
      const blinding = randomBytes(32);
      const salaryCommitment = computeSalaryCommitment(amountBigInt, new Uint8Array(blinding));
      const encryptedAmount = await encryptAmountForInco(amountBigInt);
      const ciphertextHash = computeCiphertextHash(encryptedAmount);
      const token = bytesToHex(randomBytes(32));
      const tokenHash = hashToken(token);
      const tokenCiphertext = encryptToken(token);

      const paylink = await prisma.paylink.create({
        data: {
          orgId,
          amount: data.amount,
          currency: data.currency,
          recipientWallet: data.recipientWallet,
          recipientConfAccount: data.recipientConfAccount,
          salaryCommitmentHex: bytesToHex(salaryCommitment),
          ciphertextHashHex: bytesToHex(ciphertextHash),
          encryptedAmountB64: Buffer.from(encryptedAmount).toString('base64'),
          tokenHash,
          tokenCiphertext,
          expiresAt: new Date(data.expiresAt),
          memo: data.memo,
          createdBy: req.wallet!,
        },
      });

      await createAuditLog({
        orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CREATE_PAYLINK,
        entityType: 'Paylink',
        entityId: paylink.id,
        metadata: { amount: data.amount, currency: data.currency },
      });

      const baseUrl = process.env.EMPLOYEE_APP_URL || 'http://localhost:3002';
      const claimUrl = `${baseUrl}/paylinks/${paylink.id}?token=${token}`;

      let emailSent = false;
      if (data.sendEmail && data.recipientEmail) {
        const org = await prisma.org.findUnique({
          where: { id: orgId },
          select: { name: true },
        });

        emailSent = await emailService.sendClaimLink({
          to: data.recipientEmail,
          recipientName: data.recipientName,
          orgName: org?.name || 'Unknown Organization',
          amount: data.amount,
          currency: data.currency,
          claimToken: token,
          paylinkId: paylink.id,
          expiresAt: new Date(data.expiresAt),
          memo: data.memo,
        });
      }

      const { tokenHash: _tokenHash, tokenCiphertext: _tokenCiphertext, ...rest } = paylink;
      return res.status(201).json({
        ...rest,
        claimUrl,
        emailSent,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Create paylink error:', error);
      return res.status(500).json({ error: 'Failed to create paylink' });
    }
  }
);

router.get(
  '/:orgId/paylinks/:paylinkId',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const paylink = await prisma.paylink.findUnique({
        where: { id: req.params.paylinkId },
        select: {
          id: true,
          orgId: true,
          amount: true,
          currency: true,
          recipientWallet: true,
          status: true,
          expiresAt: true,
          claimedAt: true,
          memo: true,
          createdAt: true,
          createdBy: true,
        },
      });

      if (!paylink || paylink.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Paylink not found' });
      }

      return res.json(paylink);
    } catch (error) {
      console.error('Get paylink error:', error);
      return res.status(500).json({ error: 'Failed to get paylink' });
    }
  }
);

router.post(
  '/:orgId/paylinks/:paylinkId/send-email',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { email, recipientName } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const paylink = await prisma.paylink.findUnique({
        where: { id: req.params.paylinkId },
        include: {
          org: { select: { name: true } },
        },
      });

      if (!paylink || paylink.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Paylink not found' });
      }

      if (paylink.status !== PaylinkStatus.ACTIVE) {
        return res.status(400).json({ error: `Cannot send email for ${paylink.status} paylink` });
      }

      if (new Date() > paylink.expiresAt) {
        return res.status(400).json({ error: 'Paylink has expired' });
      }

      let tokenToSend = paylink.tokenCiphertext ? decryptToken(paylink.tokenCiphertext) : null;
      if (!tokenToSend) {
        tokenToSend = bytesToHex(randomBytes(32));
        await prisma.paylink.update({
          where: { id: paylink.id },
          data: {
            tokenHash: hashToken(tokenToSend),
            tokenCiphertext: encryptToken(tokenToSend),
          },
        });
      }

      const emailSent = await emailService.sendClaimLink({
        to: email,
        recipientName,
        orgName: paylink.org.name,
        amount: paylink.amount,
        currency: paylink.currency,
        claimToken: tokenToSend,
        paylinkId: paylink.id,
        expiresAt: paylink.expiresAt,
        memo: paylink.memo || undefined,
      });

      if (!emailSent) {
        return res.status(500).json({ error: 'Failed to send email. Check email configuration.' });
      }

      return res.json({ success: true, message: `Email sent to ${email}` });
    } catch (error) {
      console.error('Send paylink email error:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  }
);

router.post(
  '/:orgId/paylinks/:paylinkId/cancel',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const paylink = await prisma.paylink.findUnique({
        where: { id: req.params.paylinkId },
      });

      if (!paylink || paylink.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Paylink not found' });
      }

      if (paylink.status !== PaylinkStatus.ACTIVE) {
        return res.status(400).json({ error: `Cannot cancel paylink in ${paylink.status} status` });
      }

      await prisma.paylink.update({
        where: { id: req.params.paylinkId },
        data: { status: PaylinkStatus.CANCELLED },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CANCEL_PAYLINK,
        entityType: 'Paylink',
        entityId: paylink.id,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Cancel paylink error:', error);
      return res.status(500).json({ error: 'Failed to cancel paylink' });
    }
  }
);

router.get('/paylinks/:token/claim', async (req, res) => {
  try {
    const tokenHash = hashToken(req.params.token);
    let paylink = await prisma.paylink.findUnique({
      where: { tokenHash },
      include: {
        org: {
          select: {
            name: true,
            orgIdHex: true,
          },
        },
      },
    });
    if (!paylink) {
      paylink = await prisma.paylink.findUnique({
        where: { tokenHash: req.params.token },
        include: {
          org: {
            select: {
              name: true,
              orgIdHex: true,
            },
          },
        },
      });
    }

    if (!paylink) {
      return res.status(404).json({ error: 'Paylink not found' });
    }

    if (paylink.status !== PaylinkStatus.ACTIVE) {
      return res.status(410).json({ error: `Paylink is ${paylink.status.toLowerCase()}` });
    }

    if (new Date() > paylink.expiresAt) {
      await prisma.paylink.update({
        where: { id: paylink.id },
        data: { status: PaylinkStatus.EXPIRED },
      });
      return res.status(410).json({ error: 'Paylink has expired' });
    }

    const amountUsd = (Number(BigInt(paylink.amount)) / 1_000_000).toFixed(2);

    return res.json({
      id: paylink.id,
      orgName: paylink.org.name,
      amountDisplay: `${amountUsd} ${paylink.currency}`,
      currency: paylink.currency,
      memo: paylink.memo,
      expiresAt: paylink.expiresAt,
      salaryCommitmentHex: paylink.salaryCommitmentHex,
      ciphertextHashHex: paylink.ciphertextHashHex,
      encryptedAmountB64: paylink.encryptedAmountB64,
    });
  } catch (error) {
    console.error('Get paylink claim info error:', error);
    return res.status(500).json({ error: 'Failed to get paylink info' });
  }
});

router.post('/paylinks/:token/claim', async (req, res) => {
  try {
    const { claimerWallet, claimerConfAccount, txSig } = req.body;

    if (!claimerWallet || !txSig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const tokenHash = hashToken(req.params.token);
    let paylink = await prisma.paylink.findUnique({
      where: { tokenHash },
    });
    if (!paylink) {
      paylink = await prisma.paylink.findUnique({
        where: { tokenHash: req.params.token },
      });
    }

    if (!paylink) {
      return res.status(404).json({ error: 'Paylink not found' });
    }

    if (paylink.status !== PaylinkStatus.ACTIVE) {
      return res.status(410).json({ error: `Paylink is ${paylink.status.toLowerCase()}` });
    }

    if (new Date() > paylink.expiresAt) {
      await prisma.paylink.update({
        where: { id: paylink.id },
        data: { status: PaylinkStatus.EXPIRED },
      });
      return res.status(410).json({ error: 'Paylink has expired' });
    }

    if (paylink.recipientWallet && paylink.recipientWallet !== claimerWallet) {
      return res.status(403).json({ error: 'Recipient wallet mismatch' });
    }

    const validSignature = await verifyTxSigner(txSig, claimerWallet);
    if (!validSignature) {
      return res.status(400).json({ error: 'Invalid transaction signature' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.paylink.update({
        where: { id: paylink.id },
        data: {
          status: PaylinkStatus.CLAIMED,
          claimedBy: claimerWallet,
          claimedAt: new Date(),
          payoutTxSig: txSig,
          recipientConfAccount: claimerConfAccount || paylink.recipientConfAccount,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          orgId: paylink.orgId,
          paylinkId: paylink.id,
          type: LedgerEntryType.PAYOUT,
          amount: `-${paylink.amount}`,
          currency: paylink.currency,
          txSig,
          description: `Paylink claimed by ${claimerWallet.slice(0, 8)}...`,
        },
      });
    });

    await createAuditLog({
      orgId: paylink.orgId,
      actorWallet: claimerWallet,
      action: AuditActions.CLAIM_PAYLINK,
      entityType: 'Paylink',
      entityId: paylink.id,
      metadata: { txSig },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Claim paylink error:', error);
    return res.status(500).json({ error: 'Failed to claim paylink' });
  }
});

export default router;
