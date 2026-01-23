import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { encryptValue } from '@inco/solana-sdk/encryption';
import { hexToBuffer } from '@inco/solana-sdk/utils';

export async function encryptAmountForInco(amount: bigint): Promise<Uint8Array> {
  const encryptedHex = await encryptValue(amount);
  return new Uint8Array(hexToBuffer(encryptedHex));
}

let cachedKey: Buffer | null = null;

function deriveKeyBytes(source: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(source)) {
    return Buffer.from(source, 'hex');
  }

  try {
    const b64 = Buffer.from(source, 'base64');
    if (b64.length === 32) {
      return b64;
    }
  } catch {
    // Ignore invalid base64 inputs.
  }

  const utf8 = Buffer.from(source, 'utf8');
  if (utf8.length >= 32) {
    return utf8.subarray(0, 32);
  }

  return createHash('sha256').update(utf8).digest();
}

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const keySource = process.env.PAYROLL_ENCRYPTION_KEY;
  if (!keySource) {
    throw new Error(
      'PAYROLL_ENCRYPTION_KEY is required for amount encryption. ' +
        'Generate a secure key with: openssl rand -hex 32'
    );
  }

  if (process.env.JWT_SECRET && keySource === process.env.JWT_SECRET) {
    throw new Error(
      'SECURITY: PAYROLL_ENCRYPTION_KEY must be different from JWT_SECRET. ' +
        'Using the same key for signing and encryption is a security anti-pattern.'
    );
  }

  cachedKey = deriveKeyBytes(keySource);
  return cachedKey;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptToken(ciphertextB64: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(ciphertextB64, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}
