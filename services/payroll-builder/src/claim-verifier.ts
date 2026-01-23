import { Connection, PublicKey } from '@solana/web3.js';
import { deriveClaimPdas, deriveNullifierPda, hexToBytes, ZURPAY_PROGRAM_ID } from '@zurpay/sdk';
import { ClaimPackageV2 } from './types';

function getSolanaRpcUrl(): string {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (heliusApiKey) {
    return `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }
  return process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
}

const connection = new Connection(getSolanaRpcUrl(), 'confirmed');

function getMessageKeys(message: any): PublicKey[] {
  if (typeof message.getAccountKeys === 'function') {
    return message.getAccountKeys().staticAccountKeys;
  }
  return message.accountKeys || [];
}

function getCompiledInstructions(
  message: any
): Array<{ programIdIndex: number; accounts: number[] }> {
  return message.compiledInstructions || message.instructions || [];
}

function hasRequiredAccounts(
  keys: PublicKey[],
  accounts: number[],
  required: PublicKey[]
): boolean {
  const accountSet = new Set(accounts.map((idx) => keys[idx]?.toBase58()));
  return required.every((pubkey) => accountSet.has(pubkey.toBase58()));
}

export async function verifyClaimTransaction(
  txSignature: string,
  claimPackage: ClaimPackageV2
): Promise<boolean> {
  const tx = await connection.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx || tx.meta?.err) {
    return false;
  }

  const { org, payrun } = deriveClaimPdas(
    claimPackage.orgIdHex,
    claimPackage.payrunIdHex,
    ZURPAY_PROGRAM_ID
  );
  const nullifier = deriveNullifierPda(
    hexToBytes(claimPackage.orgIdHex),
    hexToBytes(claimPackage.payrunIdHex),
    hexToBytes(claimPackage.nullifierHex),
    ZURPAY_PROGRAM_ID
  );

  const message = tx.transaction.message as any;
  const keys = getMessageKeys(message);
  const instructions = getCompiledInstructions(message);

  return instructions.some((ix) => {
    const programId = keys[ix.programIdIndex];
    if (!programId || !programId.equals(ZURPAY_PROGRAM_ID)) {
      return false;
    }
    return hasRequiredAccounts(keys, ix.accounts, [org, payrun, nullifier]);
  });
}
