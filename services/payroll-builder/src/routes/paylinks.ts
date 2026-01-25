import { Router } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../db';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { emailService } from '../services/email';
import { MemberRole, PaylinkStatus, LedgerEntryType } from '../generated/prisma';
import {
  computeSalaryCommitment,
  computeCiphertextHash,
  computeEmployeeCommitment,
  computeNullifier,
  computeLeafV2,
  MerkleTree,
  bytesToHex,
  hexToBytes,
  generateSecret,
} from '@zurpay/sdk';
import {
  decryptToken,
  encryptAmountForInco,
  encryptToken,
  encryptSecret,
  hashToken,
} from '../crypto';

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
          paylinkIdHex: true,
          merkleRootHex: true,
          amount: true,
          currency: true,
          recipientWallet: true,
          status: true,
          expiresAt: true,
          claimedAt: true,
          onChainTxSig: true,
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

      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { orgIdHex: true, name: true },
      });
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const amountBigInt = BigInt(data.amount);
      const employeeSecret = generateSecret();
      const employeeCommitment = computeEmployeeCommitment(employeeSecret);
      const salaryCommitment = computeSalaryCommitment(amountBigInt, employeeSecret);
      const encryptedAmount = await encryptAmountForInco(amountBigInt);
      const ciphertextHash = computeCiphertextHash(encryptedAmount);

      const paylinkIdBytes = randomBytes(32);
      const orgIdBytes = hexToBytes(org.orgIdHex);
      const nullifier = computeNullifier(orgIdBytes, paylinkIdBytes, employeeSecret);

      const dummyPayoutPubkeyHash = new Uint8Array(32);
      const leaf = computeLeafV2(
        paylinkIdBytes,
        employeeCommitment,
        salaryCommitment,
        ciphertextHash,
        dummyPayoutPubkeyHash
      );
      const tree = new MerkleTree([leaf]);
      const merkleRoot = tree.root;
      const { path, indices } = tree.getProof(0);

      const token = bytesToHex(randomBytes(32));
      const tokenHash = hashToken(token);
      const tokenCiphertext = encryptToken(token);
      const employeeSecretEnc = encryptSecret(employeeSecret);

      const expiresAt = new Date(data.expiresAt);

      const paylinkIdHex = bytesToHex(paylinkIdBytes);

      const paylink = await prisma.$transaction(async (tx) => {
        const pl = await tx.paylink.create({
          data: {
            orgId,
            paylinkIdHex,
            amount: data.amount,
            currency: data.currency,
            recipientWallet: data.recipientWallet,
            recipientConfAccount: data.recipientConfAccount,
            salaryCommitmentHex: bytesToHex(salaryCommitment),
            ciphertextHashHex: bytesToHex(ciphertextHash),
            encryptedAmountB64: Buffer.from(encryptedAmount).toString('base64'),
            nullifierHex: bytesToHex(nullifier),
            merkleRootHex: bytesToHex(merkleRoot),
            tokenHash,
            tokenCiphertext,
            expiresAt,
            memo: data.memo,
            createdBy: req.wallet!,
          },
        });

        await tx.claimToken.create({
          data: {
            tokenHash,
            payrunId: bytesToHex(paylinkIdBytes),
            paylinkId: pl.id,
            expectedEmail: data.recipientEmail,
            employeeSecretEnc,
            merklePathJson: JSON.stringify(path.map((p) => bytesToHex(p))),
            pathIndicesJson: JSON.stringify(indices),
            leafIndex: 0,
            salaryCommitmentHex: bytesToHex(salaryCommitment),
            ciphertextHashHex: bytesToHex(ciphertextHash),
            employeeCommitmentHex: bytesToHex(employeeCommitment),
            nullifierHex: bytesToHex(nullifier),
            encryptedAmountB64: Buffer.from(encryptedAmount).toString('base64'),
            expiresAt,
          },
        });

        return pl;
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
        emailSent = await emailService.sendClaimLink({
          to: data.recipientEmail,
          recipientName: data.recipientName,
          orgName: org.name,
          amount: data.amount,
          currency: data.currency,
          claimToken: token,
          paylinkId: paylink.id,
          expiresAt,
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

// Record on-chain registration (called after admin signs and submits set_payrun tx)
router.post(
  '/:orgId/paylinks/:paylinkId/set-on-chain',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { txSig } = req.body;

      if (!txSig) {
        return res.status(400).json({ error: 'Transaction signature is required' });
      }

      const paylink = await prisma.paylink.findUnique({
        where: { id: req.params.paylinkId },
      });

      if (!paylink || paylink.orgId !== req.params.orgId) {
        return res.status(404).json({ error: 'Paylink not found' });
      }

      if (paylink.onChainTxSig) {
        return res.status(400).json({ error: 'Paylink is already posted on-chain' });
      }

      if (!paylink.merkleRootHex || !paylink.paylinkIdHex) {
        return res.status(400).json({ error: 'Paylink is missing required cryptographic data' });
      }

      await prisma.paylink.update({
        where: { id: req.params.paylinkId },
        data: { onChainTxSig: txSig },
      });

      await createAuditLog({
        orgId: req.params.orgId,
        actorWallet: req.wallet!,
        action: AuditActions.CREATE_PAYLINK,
        entityType: 'Paylink',
        entityId: paylink.id,
        metadata: { action: 'set_on_chain', txSig },
      });

      return res.json({ success: true, txSig });
    } catch (error) {
      console.error('Set paylink on-chain error:', error);
      return res.status(500).json({ error: 'Failed to record on-chain transaction' });
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

    if (!paylink.onChainTxSig) {
      return res.status(400).json({
        error: 'Paylink not yet posted on-chain. Please contact the sender.',
        code: 'NOT_ON_CHAIN',
      });
    }

    const amountUsd = (Number(BigInt(paylink.amount)) / 1_000_000).toFixed(2);

    return res.json({
      id: paylink.id,
      orgName: paylink.org.name,
      orgIdHex: paylink.org.orgIdHex,
      paylinkIdHex: paylink.paylinkIdHex,
      merkleRootHex: paylink.merkleRootHex,
      amountDisplay: `${amountUsd} ${paylink.currency}`,
      currency: paylink.currency,
      memo: paylink.memo,
      expiresAt: paylink.expiresAt,
      salaryCommitmentHex: paylink.salaryCommitmentHex,
      ciphertextHashHex: paylink.ciphertextHashHex,
      encryptedAmountB64: paylink.encryptedAmountB64,
      onChainTxSig: paylink.onChainTxSig,
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
