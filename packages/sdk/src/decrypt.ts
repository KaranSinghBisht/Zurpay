/**
 * Inco Balance Decryption Utilities
 *
 * Provides functions for decrypting encrypted balances using
 * the Inco attested decryption mechanism.
 */

import { decrypt as incoDecrypt } from '@inco/solana-sdk/attested-decrypt';
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

/**
 * Function type for signing a message with wallet
 */
export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Wallet interface for decryption operations
 */
export interface DecryptionWallet {
  publicKey: PublicKey;
  signMessage: SignMessageFn;
}

/**
 * Result of a balance decryption operation
 */
export interface DecryptedBalance {
  /** The original encrypted handle */
  handle: string;
  /** The decrypted plaintext value as string */
  plaintext: string;
  /** The decrypted value as bigint (for amounts) */
  amount: bigint;
  /** The signature from covalidator for on-chain verification */
  signature: string;
}

/**
 * Full result of decryption including verification instructions
 */
export interface DecryptBalanceResult {
  /** Individual decrypted balances */
  balances: DecryptedBalance[];
  /** Ed25519 verification instructions for on-chain attestation */
  ed25519Instructions: TransactionInstruction[];
}

/**
 * Format a decrypted amount for display
 * Assumes 6 decimal places (USDC standard)
 */
export function formatDecryptedAmount(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  // Pad fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  // Remove trailing zeros
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return wholePart.toString();
  }

  return `${wholePart}.${trimmedFractional}`;
}

/**
 * Parse plaintext to bigint amount
 * Handles both decimal string and hex formats
 */
function parsePlaintext(plaintext: string): bigint {
  // Remove any whitespace
  const cleaned = plaintext.trim();

  // Check if hex format (starts with 0x)
  if (cleaned.startsWith('0x')) {
    return BigInt(cleaned);
  }

  // Try parsing as decimal
  try {
    return BigInt(cleaned);
  } catch {
    // If parsing fails, return 0
    console.warn('Failed to parse plaintext:', cleaned);
    return BigInt(0);
  }
}

/**
 * Decrypt encrypted balance handles using Inco attested decryption
 *
 * This function:
 * 1. Signs each handle with the wallet to prove ownership
 * 2. Queries the Inco covalidator for decryption
 * 3. Returns decrypted values and Ed25519 verification instructions
 *
 * @param handles - Array of encrypted handles (hex strings)
 * @param wallet - Wallet with publicKey and signMessage
 * @returns Decrypted balances and verification instructions
 *
 * @example
 * ```typescript
 * import { decryptBalances } from '@zurpay/sdk';
 *
 * const result = await decryptBalances(
 *   ['0x1234...', '0x5678...'],
 *   { publicKey: wallet.publicKey, signMessage: wallet.signMessage }
 * );
 *
 * for (const balance of result.balances) {
 *   console.log(`Handle: ${balance.handle}`);
 *   console.log(`Amount: ${balance.amount}`);
 * }
 * ```
 */
export async function decryptBalances(
  handles: string[],
  wallet: DecryptionWallet
): Promise<DecryptBalanceResult> {
  if (handles.length === 0) {
    return { balances: [], ed25519Instructions: [] };
  }

  if (handles.length > 10) {
    throw new Error('Maximum 10 handles can be decrypted at once');
  }

  const result = await incoDecrypt(handles, {
    address: wallet.publicKey,
    signMessage: wallet.signMessage,
  });

  const balances: DecryptedBalance[] = result.handles.map((handle, index) => ({
    handle,
    plaintext: result.plaintexts[index],
    amount: parsePlaintext(result.plaintexts[index]),
    signature: result.signatures[index],
  }));

  return {
    balances,
    ed25519Instructions: result.ed25519Instructions,
  };
}

/**
 * Decrypt a single balance handle
 * Convenience wrapper around decryptBalances
 *
 * @param handle - Single encrypted handle
 * @param wallet - Wallet for signing
 * @returns Single decrypted balance
 */
export async function decryptSingleBalance(
  handle: string,
  wallet: DecryptionWallet
): Promise<DecryptedBalance> {
  const result = await decryptBalances([handle], wallet);

  if (result.balances.length === 0) {
    throw new Error('Decryption returned no results');
  }

  return result.balances[0];
}
