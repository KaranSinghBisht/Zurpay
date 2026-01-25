import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { DEFAULT_INCO_PROGRAM_ID } from './constants';

export const INCO_TOKEN_PROGRAM_ID = new PublicKey('4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N');

export const INCO_ACCOUNT_SIZE = 8 + 213;
export const INCO_MINT_SIZE = 8 + 106;

export interface IncoAccount {
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  state: 'uninitialized' | 'initialized' | 'frozen';
}

export function deriveAllowancePda(
  handle: bigint,
  allowedAddress: PublicKey,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): PublicKey {
  const handleBuffer = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    handleBuffer[i] = Number(h & BigInt(0xff));
    h = h >> BigInt(8);
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [handleBuffer, allowedAddress.toBuffer()],
    incoProgramId
  );
  return pda;
}

export function buildInitializeAccountInstruction(
  account: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
  programId: PublicKey = INCO_TOKEN_PROGRAM_ID,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x12, 0xb4, 0xd6, 0x8c, 0x0a, 0x8b, 0xf0, 0xa4]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: incoProgramId, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });
}

export interface TransferAccounts {
  source: PublicKey;
  destination: PublicKey;
  authority: PublicKey;
  sourceOwner: PublicKey;
  destOwner: PublicKey;
}

export function buildTransferInstruction(
  accounts: TransferAccounts,
  encryptedAmount: Uint8Array,
  sourceBalanceHandle: bigint,
  destBalanceHandle: bigint,
  programId: PublicKey = INCO_TOKEN_PROGRAM_ID,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0xa3, 0x34, 0xc8, 0xe7, 0x8c, 0x5a, 0x8e, 0x1d]);

  const inputType = Buffer.from([0]);

  const ciphertextLen = Buffer.alloc(4);
  ciphertextLen.writeUInt32LE(encryptedAmount.length, 0);

  const data = Buffer.concat([
    discriminator,
    ciphertextLen,
    Buffer.from(encryptedAmount),
    inputType,
  ]);

  const sourceAllowancePda = deriveAllowancePda(
    sourceBalanceHandle,
    accounts.sourceOwner,
    incoProgramId
  );
  const destAllowancePda = deriveAllowancePda(destBalanceHandle, accounts.destOwner, incoProgramId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: accounts.source, isSigner: false, isWritable: true },
      { pubkey: accounts.destination, isSigner: false, isWritable: true },
      { pubkey: accounts.authority, isSigner: true, isWritable: true },
      { pubkey: incoProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: sourceAllowancePda, isSigner: false, isWritable: true },
      { pubkey: accounts.sourceOwner, isSigner: false, isWritable: false },
      { pubkey: destAllowancePda, isSigner: false, isWritable: true },
      { pubkey: accounts.destOwner, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function fetchIncoAccount(
  connection: Connection,
  accountPubkey: PublicKey
): Promise<IncoAccount | null> {
  const accountInfo = await connection.getAccountInfo(accountPubkey);
  if (!accountInfo || accountInfo.data.length < INCO_ACCOUNT_SIZE) {
    return null;
  }

  const data = accountInfo.data;
  const mint = new PublicKey(data.slice(8, 40));
  const owner = new PublicKey(data.slice(40, 72));

  const amountBytes = data.slice(72, 88);
  let amount = BigInt(0);
  for (let i = 0; i < 16; i++) {
    amount = amount | (BigInt(amountBytes[i]) << BigInt(i * 8));
  }

  const stateOffset = 88 + 36;
  const stateByte = data[stateOffset];
  const state = stateByte === 0 ? 'uninitialized' : stateByte === 1 ? 'initialized' : 'frozen';

  return { mint, owner, amount, state };
}

export async function initializeIncoAccount(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  account: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  programId: PublicKey = INCO_TOKEN_PROGRAM_ID,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): Promise<string> {
  const instruction = buildInitializeAccountInstruction(
    account,
    mint,
    owner,
    wallet.publicKey,
    programId,
    incoProgramId
  );

  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  return signature;
}

export async function transferIncoTokens(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  source: PublicKey,
  destination: PublicKey,
  encryptedAmount: Uint8Array,
  programId: PublicKey = INCO_TOKEN_PROGRAM_ID,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): Promise<string> {
  const [sourceAccount, destAccount] = await Promise.all([
    fetchIncoAccount(connection, source),
    fetchIncoAccount(connection, destination),
  ]);

  if (!sourceAccount) {
    throw new Error('Source account not found or not initialized');
  }
  if (!destAccount) {
    throw new Error('Destination account not found or not initialized');
  }
  if (sourceAccount.state !== 'initialized') {
    throw new Error(`Source account is ${sourceAccount.state}`);
  }
  if (destAccount.state !== 'initialized') {
    throw new Error(`Destination account is ${destAccount.state}`);
  }
  if (!sourceAccount.mint.equals(destAccount.mint)) {
    throw new Error('Mint mismatch between source and destination');
  }

  const instruction = buildTransferInstruction(
    {
      source,
      destination,
      authority: wallet.publicKey,
      sourceOwner: sourceAccount.owner,
      destOwner: destAccount.owner,
    },
    encryptedAmount,
    sourceAccount.amount,
    destAccount.amount,
    programId,
    incoProgramId
  );

  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  return signature;
}
