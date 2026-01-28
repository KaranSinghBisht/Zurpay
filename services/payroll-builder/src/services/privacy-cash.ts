/**
 * Privacy Cash Service
 *
 * Provides mixing/unlinkability for treasury funding and withdrawals.
 * Privacy Cash breaks the on-chain link between deposits and withdrawals
 * using ZK proofs and relayers.
 *
 * Use cases:
 * 1. Fund treasury privately (hide who funded the payroll)
 * 2. Withdraw to fresh wallets (hide link between org and employee)
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../logger';

// Privacy Cash SDK types (minimal interface for what we need)
interface PrivacyCashClient {
  deposit(params: { lamports: number }): Promise<{ tx: string }>;
  withdraw(params: {
    lamports: number;
    recipientAddress?: string;
    referrer?: string;
  }): Promise<{
    tx: string;
    recipient: string;
    amount_in_lamports: number;
    fee_in_lamports: number;
    isPartial: boolean;
  }>;
  depositUSDC(params: { base_units: number }): Promise<{ tx: string }>;
  depositSPL(params: {
    mintAddress: string;
    amount?: number;
    base_units?: number;
  }): Promise<{ tx: string }>;
  withdrawUSDC(params: {
    base_units: number;
    recipientAddress?: string;
    referrer?: string;
  }): Promise<{
    tx: string;
    recipient: string;
    base_units: number;
    fee_base_units: number;
    isPartial: boolean;
  }>;
  withdrawSPL(params: {
    mintAddress: string;
    amount?: number;
    base_units?: number;
    recipientAddress?: string;
    referrer?: string;
  }): Promise<{
    tx: string;
    recipient: string;
    base_units: number;
    fee_base_units: number;
    isPartial: boolean;
  }>;
  getPrivateBalance(abortSignal?: AbortSignal): Promise<{ lamports: number }>;
  getPrivateBalanceUSDC(): Promise<{ amount: number }>;
  getPrivateBalanceSpl(mintAddress: string): Promise<{ amount: number }>;
}

// Environment configuration
const PRIVACY_CASH_RPC_URL = process.env.PRIVACY_CASH_RPC_URL || process.env.SOLANA_RPC_URL;
const PRIVACY_CASH_PRIVATE_KEY = process.env.PRIVACY_CASH_PRIVATE_KEY;

// Singleton client instance
let clientInstance: PrivacyCashClient | null = null;
let initializationError: Error | null = null;

/**
 * Initialize the Privacy Cash client
 * Uses a dedicated private key for privacy operations
 */
async function initializeClient(): Promise<PrivacyCashClient> {
  if (clientInstance) return clientInstance;
  if (initializationError) throw initializationError;

  if (!PRIVACY_CASH_PRIVATE_KEY) {
    initializationError = new Error(
      'PRIVACY_CASH_PRIVATE_KEY not configured. Set this env var to enable private funding.'
    );
    throw initializationError;
  }

  if (!PRIVACY_CASH_RPC_URL) {
    initializationError = new Error('PRIVACY_CASH_RPC_URL or SOLANA_RPC_URL not configured.');
    throw initializationError;
  }

  try {
    // Dynamic import to avoid issues if SDK has problems loading
    const { PrivacyCash } = await import('privacycash');

    clientInstance = new PrivacyCash({
      RPC_url: PRIVACY_CASH_RPC_URL,
      owner: PRIVACY_CASH_PRIVATE_KEY,
      enableDebug: process.env.NODE_ENV === 'development',
    }) as PrivacyCashClient;

    logger.info('Privacy Cash client initialized');
    return clientInstance;
  } catch (error) {
    initializationError = error as Error;
    logger.error({ error }, 'Failed to initialize Privacy Cash client');
    throw error;
  }
}

/**
 * Check if Privacy Cash is configured and available
 */
export function isPrivacyCashEnabled(): boolean {
  return !!PRIVACY_CASH_PRIVATE_KEY && !!PRIVACY_CASH_RPC_URL;
}

/**
 * Get the Privacy Cash wallet address (for UI display)
 */
export function getPrivacyCashWalletAddress(): string | null {
  if (!PRIVACY_CASH_PRIVATE_KEY) return null;

  try {
    // Support both base58 and array formats
    let keypair: Keypair;
    if (PRIVACY_CASH_PRIVATE_KEY.startsWith('[')) {
      const secretKey = new Uint8Array(JSON.parse(PRIVACY_CASH_PRIVATE_KEY));
      keypair = Keypair.fromSecretKey(secretKey);
    } else {
      const secretKey = bs58.decode(PRIVACY_CASH_PRIVATE_KEY);
      keypair = Keypair.fromSecretKey(secretKey);
    }
    return keypair.publicKey.toBase58();
  } catch {
    return null;
  }
}

/**
 * Get shielded USDC balance in Privacy Cash pool
 */
export async function getShieldedBalanceUSDC(): Promise<number> {
  const client = await initializeClient();
  const result = await client.getPrivateBalanceUSDC();
  return result.amount;
}

/**
 * Get shielded SOL balance in Privacy Cash pool
 */
export async function getShieldedBalanceSOL(): Promise<number> {
  const client = await initializeClient();
  const result = await client.getPrivateBalance();
  return result.lamports;
}

/**
 * Deposit USDC into Privacy Cash shielded pool
 *
 * @param amountUSDC - Amount in USDC (human readable, e.g., 100 for $100)
 * @returns Transaction signature
 */
export async function depositUSDC(amountUSDC: number): Promise<string> {
  const client = await initializeClient();

  // Convert to base units (USDC has 6 decimals)
  const baseUnits = Math.floor(amountUSDC * 1_000_000);

  logger.info({ amountUSDC, baseUnits }, 'Depositing USDC to Privacy Cash');

  const result = await client.depositUSDC({ base_units: baseUnits });
  const txSignature = result.tx;

  logger.info({ txSignature, amountUSDC }, 'USDC deposited to Privacy Cash');
  return txSignature;
}

/**
 * Withdraw USDC from Privacy Cash to any address
 * The withdrawal comes from the relayer, breaking the link to the original depositor
 *
 * @param amountUSDC - Amount in USDC (human readable)
 * @param recipientAddress - Destination wallet address
 * @returns Withdrawal result with transaction signature and fees
 */
export async function withdrawUSDC(
  amountUSDC: number,
  recipientAddress: string
): Promise<{
  txSignature: string;
  recipient: string;
  amountReceived: number;
  feePaid: number;
}> {
  const client = await initializeClient();

  // Convert to base units
  const baseUnits = Math.floor(amountUSDC * 1_000_000);

  logger.info({ amountUSDC, baseUnits, recipientAddress }, 'Withdrawing USDC from Privacy Cash');

  const result = await client.withdrawUSDC({
    base_units: baseUnits,
    recipientAddress,
  });

  logger.info(
    {
      txSignature: result.tx,
      amountReceived: result.base_units / 1_000_000,
      feePaid: result.fee_base_units / 1_000_000,
    },
    'USDC withdrawn from Privacy Cash'
  );

  return {
    txSignature: result.tx,
    recipient: result.recipient,
    amountReceived: result.base_units / 1_000_000,
    feePaid: result.fee_base_units / 1_000_000,
  };
}

/**
 * Fund a treasury address privately
 * This is a two-step process:
 * 1. Deposit funds into Privacy Cash (if not already shielded)
 * 2. Withdraw to treasury address (from relayer, breaking the link)
 *
 * @param treasuryAddress - The treasury PDA address to fund
 * @param amountUSDC - Amount in USDC
 * @returns Result with both transaction signatures
 */
export async function fundTreasuryPrivately(
  treasuryAddress: string,
  amountUSDC: number
): Promise<{
  depositTxSignature: string | null;
  withdrawTxSignature: string;
  amountReceived: number;
  feePaid: number;
}> {
  logger.info({ treasuryAddress, amountUSDC }, 'Starting private treasury funding');

  // Check current shielded balance
  const currentBalance = await getShieldedBalanceUSDC();
  const requiredBaseUnits = Math.floor(amountUSDC * 1_000_000);

  let depositTxSignature: string | null = null;

  // If not enough shielded balance, deposit first
  if (currentBalance < requiredBaseUnits) {
    const depositAmount = amountUSDC - currentBalance / 1_000_000 + 1; // Add buffer for fees
    depositTxSignature = await depositUSDC(depositAmount);

    // Wait a bit for deposit to settle
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Withdraw to treasury
  const withdrawResult = await withdrawUSDC(amountUSDC, treasuryAddress);

  logger.info(
    {
      treasuryAddress,
      amountUSDC,
      amountReceived: withdrawResult.amountReceived,
      feePaid: withdrawResult.feePaid,
    },
    'Treasury funded privately'
  );

  return {
    depositTxSignature,
    withdrawTxSignature: withdrawResult.txSignature,
    amountReceived: withdrawResult.amountReceived,
    feePaid: withdrawResult.feePaid,
  };
}

/**
 * Withdraw employee funds privately
 * Used when an employee wants to withdraw their claimed funds to a fresh wallet
 *
 * @param amountUSDC - Amount to withdraw
 * @param destinationWallet - Employee's chosen destination wallet
 * @returns Withdrawal result
 */
export async function withdrawEmployeeFundsPrivately(
  amountUSDC: number,
  destinationWallet: string
): Promise<{
  txSignature: string;
  amountReceived: number;
  feePaid: number;
}> {
  logger.info({ amountUSDC, destinationWallet }, 'Processing private employee withdrawal');

  const result = await withdrawUSDC(amountUSDC, destinationWallet);

  return {
    txSignature: result.txSignature,
    amountReceived: result.amountReceived,
    feePaid: result.feePaid,
  };
}

/**
 * Calculate fees for a Privacy Cash withdrawal
 * Fee structure: 0.35% + ~0.006 SOL rent
 */
export function calculateWithdrawalFee(amountUSDC: number): {
  percentageFee: number;
  estimatedTotalFee: number;
} {
  const percentageFee = amountUSDC * 0.0035; // 0.35%
  const rentFeeUSDC = 0.01; // Approximate rent fee in USD
  return {
    percentageFee,
    estimatedTotalFee: percentageFee + rentFeeUSDC,
  };
}

/**
 * Get Privacy Cash service status
 */
export async function getServiceStatus(): Promise<{
  enabled: boolean;
  walletAddress: string | null;
  shieldedBalanceUSDC: number | null;
  shieldedBalanceSOL: number | null;
  error: string | null;
}> {
  if (!isPrivacyCashEnabled()) {
    return {
      enabled: false,
      walletAddress: null,
      shieldedBalanceUSDC: null,
      shieldedBalanceSOL: null,
      error: 'Privacy Cash not configured',
    };
  }

  try {
    const [balanceUSDC, balanceSOL] = await Promise.all([
      getShieldedBalanceUSDC(),
      getShieldedBalanceSOL(),
    ]);

    return {
      enabled: true,
      walletAddress: getPrivacyCashWalletAddress(),
      shieldedBalanceUSDC: balanceUSDC / 1_000_000,
      shieldedBalanceSOL: balanceSOL / 1_000_000_000,
      error: null,
    };
  } catch (error) {
    return {
      enabled: true,
      walletAddress: getPrivacyCashWalletAddress(),
      shieldedBalanceUSDC: null,
      shieldedBalanceSOL: null,
      error: (error as Error).message,
    };
  }
}
