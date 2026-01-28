import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireWallet, requireOrg } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { MemberRole } from '../generated/prisma';
import {
  isPrivacyCashEnabled,
  getServiceStatus,
  fundTreasuryPrivately,
  depositUSDC,
  withdrawUSDC,
  calculateWithdrawalFee,
  getPrivacyCashWalletAddress,
} from '../services/privacy-cash';
import { logger } from '../logger';

const router = Router();

// Schema for private funding request
const PrivateFundSchema = z.object({
  amountUSDC: z.number().positive().max(1000000), // Max 1M USDC per tx
  treasuryAddress: z.string().min(32).max(64),
});

// Schema for deposit request
const DepositSchema = z.object({
  amountUSDC: z.number().positive().max(1000000),
});

// Schema for withdrawal request
const WithdrawSchema = z.object({
  amountUSDC: z.number().positive().max(1000000),
  recipientAddress: z.string().min(32).max(64),
});

/**
 * GET /:orgId/treasury/privacy-cash/status
 * Get Privacy Cash service status and shielded balances
 */
router.get(
  '/:orgId/treasury/privacy-cash/status',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = await getServiceStatus();

      // Add fee info
      const feeInfo = {
        depositFee: 'Free (only ~0.002 SOL network fee)',
        withdrawalFee: '0.35% + ~0.006 SOL rent',
        example: calculateWithdrawalFee(1000), // Example for $1000
      };

      return res.json({
        ...status,
        feeInfo,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get Privacy Cash status');
      return res.status(500).json({ error: 'Failed to get Privacy Cash status' });
    }
  }
);

/**
 * POST /:orgId/treasury/privacy-cash/fund
 * Fund treasury privately via Privacy Cash
 * This breaks the on-chain link between the funder and the treasury
 */
router.post(
  '/:orgId/treasury/privacy-cash/fund',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!isPrivacyCashEnabled()) {
        return res.status(503).json({
          error: 'Privacy Cash not configured',
          message:
            'Set PRIVACY_CASH_PRIVATE_KEY and PRIVACY_CASH_RPC_URL environment variables to enable private funding.',
        });
      }

      const data = PrivateFundSchema.parse(req.body);
      const orgId = req.params.orgId;
      const wallet = req.wallet!;

      logger.info(
        { orgId, amountUSDC: data.amountUSDC, treasuryAddress: data.treasuryAddress },
        'Starting private treasury funding'
      );

      const result = await fundTreasuryPrivately(data.treasuryAddress, data.amountUSDC);

      // Log the action
      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.FUND_TREASURY,
        entityType: 'Treasury',
        entityId: data.treasuryAddress,
        metadata: {
          amountUSDC: data.amountUSDC,
          amountReceived: result.amountReceived,
          feePaid: result.feePaid,
          depositTxSignature: result.depositTxSignature,
          withdrawTxSignature: result.withdrawTxSignature,
          fundingMethod: 'privacy-cash',
        },
      });

      return res.json({
        success: true,
        message: 'Treasury funded privately via Privacy Cash',
        depositTxSignature: result.depositTxSignature,
        withdrawTxSignature: result.withdrawTxSignature,
        amountRequested: data.amountUSDC,
        amountReceived: result.amountReceived,
        feePaid: result.feePaid,
        privacyNote:
          'The treasury received funds from the Privacy Cash relayer, not from your wallet directly. This breaks the on-chain link between you and the treasury.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error({ error }, 'Private treasury funding failed');
      return res.status(500).json({
        error: 'Private funding failed',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * POST /:orgId/treasury/privacy-cash/deposit
 * Deposit USDC into Privacy Cash shielded pool
 * Use this to shield funds before withdrawing to treasury
 */
router.post(
  '/:orgId/treasury/privacy-cash/deposit',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!isPrivacyCashEnabled()) {
        return res.status(503).json({ error: 'Privacy Cash not configured' });
      }

      const data = DepositSchema.parse(req.body);
      const orgId = req.params.orgId;
      const wallet = req.wallet!;

      logger.info({ orgId, amountUSDC: data.amountUSDC }, 'Depositing USDC to Privacy Cash');

      const txSignature = await depositUSDC(data.amountUSDC);

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.PRIVACY_CASH_DEPOSIT,
        entityType: 'PrivacyCash',
        entityId: txSignature,
        metadata: {
          amountUSDC: data.amountUSDC,
          txSignature,
        },
      });

      return res.json({
        success: true,
        message: 'USDC deposited to Privacy Cash shielded pool',
        txSignature,
        amountUSDC: data.amountUSDC,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error({ error }, 'Privacy Cash deposit failed');
      return res.status(500).json({
        error: 'Deposit failed',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * POST /:orgId/treasury/privacy-cash/withdraw
 * Withdraw USDC from Privacy Cash to any address
 * The withdrawal comes from the relayer, breaking the link
 */
router.post(
  '/:orgId/treasury/privacy-cash/withdraw',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!isPrivacyCashEnabled()) {
        return res.status(503).json({ error: 'Privacy Cash not configured' });
      }

      const data = WithdrawSchema.parse(req.body);
      const orgId = req.params.orgId;
      const wallet = req.wallet!;

      logger.info(
        { orgId, amountUSDC: data.amountUSDC, recipientAddress: data.recipientAddress },
        'Withdrawing USDC from Privacy Cash'
      );

      const result = await withdrawUSDC(data.amountUSDC, data.recipientAddress);

      await createAuditLog({
        orgId,
        actorWallet: wallet,
        action: AuditActions.PRIVACY_CASH_WITHDRAW,
        entityType: 'PrivacyCash',
        entityId: result.txSignature,
        metadata: {
          amountUSDC: data.amountUSDC,
          recipientAddress: data.recipientAddress,
          amountReceived: result.amountReceived,
          feePaid: result.feePaid,
          txSignature: result.txSignature,
        },
      });

      return res.json({
        success: true,
        message: 'USDC withdrawn from Privacy Cash',
        txSignature: result.txSignature,
        recipient: result.recipient,
        amountRequested: data.amountUSDC,
        amountReceived: result.amountReceived,
        feePaid: result.feePaid,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error({ error }, 'Privacy Cash withdrawal failed');
      return res.status(500).json({
        error: 'Withdrawal failed',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * GET /:orgId/treasury/privacy-cash/fee-estimate
 * Get fee estimate for a withdrawal amount
 */
router.get(
  '/:orgId/treasury/privacy-cash/fee-estimate',
  requireWallet,
  requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const amountStr = req.query.amount as string;
      if (!amountStr) {
        return res.status(400).json({ error: 'amount query parameter required' });
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const feeEstimate = calculateWithdrawalFee(amount);

      return res.json({
        amountUSDC: amount,
        ...feeEstimate,
        amountAfterFee: amount - feeEstimate.estimatedTotalFee,
        note: 'Actual fees may vary slightly based on network conditions',
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to calculate fee estimate' });
    }
  }
);

export default router;
