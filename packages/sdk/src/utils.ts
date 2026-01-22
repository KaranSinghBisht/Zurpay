import { PublicKey } from '@solana/web3.js';
import { randomBytes } from 'crypto';
import { PDA_SEEDS, ZURPAY_PROGRAM_ID, PUBLIC_INPUTS_LEN_V2 } from './constants';
import { sha256 } from './merkle';

export function generateSecret(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

export function generateOrgId(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

export function generatePayrunId(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${cleanHex.length}`);
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string: non-hex characters found');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function deriveOrgPda(
  orgId: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([PDA_SEEDS.ORG, orgId], programId);
  return pda;
}

export function derivePayrunPda(
  orgId: Uint8Array,
  payrunId: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([PDA_SEEDS.PAYRUN, orgId, payrunId], programId);
  return pda;
}

export function deriveNullifierPda(
  orgId: Uint8Array,
  payrunId: Uint8Array,
  nullifierHash: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.NULLIFIER, orgId, payrunId, nullifierHash],
    programId
  );
  return pda;
}

export function computePayoutPubkeyHash(payoutPubkey: PublicKey): Uint8Array {
  return sha256(payoutPubkey.toBytes());
}

export function serializePublicInputsV2(
  merkleRoot: Uint8Array,
  nullifier: Uint8Array,
  payoutPubkeyHash: Uint8Array,
  orgId: Uint8Array,
  salaryCommitment: Uint8Array,
  ciphertextHash: Uint8Array
): Uint8Array {
  const result = new Uint8Array(192);
  result.set(merkleRoot, 0);
  result.set(nullifier, 32);
  result.set(payoutPubkeyHash, 64);
  result.set(orgId, 96);
  result.set(salaryCommitment, 128);
  result.set(ciphertextHash, 160);
  return result;
}

export function parseAmount(amountStr: string, decimals: number = 6): bigint {
  const parts = amountStr.split('.');
  const whole = BigInt(parts[0] || '0');
  let fraction = parts[1] || '';

  if (fraction.length > decimals) {
    fraction = fraction.slice(0, decimals);
  } else {
    fraction = fraction.padEnd(decimals, '0');
  }

  return whole * BigInt(10 ** decimals) + BigInt(fraction);
}

export function formatAmount(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0');
  return `${whole}.${fraction}`;
}

// ============================================================================
// Base64 helpers for V2 API
// ============================================================================

/**
 * Convert base64 string to Uint8Array
 */
export function b64ToBytes(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

/**
 * Convert Uint8Array to base64 string
 */
export function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Assert that public inputs are exactly 192 bytes (v2 schema)
 */
export function assertPublicInputsV2Length(bytes: Uint8Array): void {
  if (bytes.length !== PUBLIC_INPUTS_LEN_V2) {
    throw new Error(`Expected ${PUBLIC_INPUTS_LEN_V2} bytes public inputs, got ${bytes.length}`);
  }
}

/**
 * Parse public inputs from v2 format (192 bytes)
 */
export function parsePublicInputsV2(bytes: Uint8Array): {
  merkleRoot: Uint8Array;
  nullifier: Uint8Array;
  payoutPubkeyHash: Uint8Array;
  orgId: Uint8Array;
  salaryCommitment: Uint8Array;
  ciphertextHash: Uint8Array;
} {
  assertPublicInputsV2Length(bytes);

  return {
    merkleRoot: bytes.slice(0, 32),
    nullifier: bytes.slice(32, 64),
    payoutPubkeyHash: bytes.slice(64, 96),
    orgId: bytes.slice(96, 128),
    salaryCommitment: bytes.slice(128, 160),
    ciphertextHash: bytes.slice(160, 192),
  };
}
