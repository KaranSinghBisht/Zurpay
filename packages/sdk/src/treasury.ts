import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { ZURPAY_PROGRAM_ID, PDA_SEEDS, DEFAULT_INCO_PROGRAM_ID } from './constants';
import { hexToBytes, deriveOrgPda } from './utils';

export function deriveEmployeeConfPda(
  orgId: Uint8Array,
  employeeWallet: PublicKey,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.EMPLOYEE_CONF, orgId, employeeWallet.toBuffer()],
    programId
  );
  return pda;
}

export function deriveTreasuryPda(
  orgId: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [treasuryPda] = PublicKey.findProgramAddressSync([PDA_SEEDS.TREASURY, orgId], programId);
  return treasuryPda;
}

export interface InitTreasuryAccounts {
  admin: PublicKey;
  org: PublicKey;
  treasury: PublicKey;
  incoProgram: PublicKey;
}

export function buildInitTreasuryInstruction(
  accounts: InitTreasuryAccounts,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x69, 0x98, 0xad, 0x33, 0x9e, 0x97, 0x31, 0x0e]);

  const keys = [
    { pubkey: accounts.admin, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.treasury, isSigner: false, isWritable: true },
    { pubkey: accounts.incoProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data: discriminator,
  });
}

export interface DepositTreasuryAccounts {
  admin: PublicKey;
  org: PublicKey;
  treasury: PublicKey;
  incoProgram: PublicKey;
}

export function buildDepositTreasuryInstruction(
  accounts: DepositTreasuryAccounts,
  encryptedAmount: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x02, 0x81, 0x48, 0xd6, 0x32, 0x5e, 0x97, 0xe6]);

  const encodeU32LE = (value: number): Buffer => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
  };

  const data = Buffer.concat([
    discriminator,
    encodeU32LE(encryptedAmount.length),
    Buffer.from(encryptedAmount),
  ]);

  const keys = [
    { pubkey: accounts.admin, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.treasury, isSigner: false, isWritable: true },
    { pubkey: accounts.incoProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data,
  });
}

export async function initTreasury(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  incoProgram: PublicKey = DEFAULT_INCO_PROGRAM_ID,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const org = deriveOrgPda(orgId, programId);
  const treasury = deriveTreasuryPda(orgId, programId);

  const instruction = buildInitTreasuryInstruction(
    {
      admin: wallet.publicKey,
      org,
      treasury,
      incoProgram,
    },
    programId
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

export async function depositTreasury(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  encryptedAmount: Uint8Array,
  incoProgram: PublicKey = DEFAULT_INCO_PROGRAM_ID,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const org = deriveOrgPda(orgId, programId);
  const treasury = deriveTreasuryPda(orgId, programId);

  const instruction = buildDepositTreasuryInstruction(
    {
      admin: wallet.publicKey,
      org,
      treasury,
      incoProgram,
    },
    encryptedAmount,
    programId
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

export interface InitEmployeeConfAccounts {
  employee: PublicKey;
  org: PublicKey;
  employeeConf: PublicKey;
  incoProgram: PublicKey;
}

export function buildInitEmployeeConfInstruction(
  accounts: InitEmployeeConfAccounts,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x46, 0xd3, 0x5c, 0x1f, 0x7b, 0x57, 0xc1, 0xee]);

  const keys = [
    { pubkey: accounts.employee, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.employeeConf, isSigner: false, isWritable: true },
    { pubkey: accounts.incoProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data: discriminator,
  });
}

export async function initEmployeeConf(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  incoProgram: PublicKey = DEFAULT_INCO_PROGRAM_ID,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const org = deriveOrgPda(orgId, programId);
  const employeeConf = deriveEmployeeConfPda(orgId, wallet.publicKey, programId);

  const instruction = buildInitEmployeeConfInstruction(
    {
      employee: wallet.publicKey,
      org,
      employeeConf,
      incoProgram,
    },
    programId
  );

  const transaction = new Transaction().add(instruction);

  const sendWithRetry = async (maxRetries = 3): Promise<string> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      const signedTx = await wallet.signTransaction(transaction);

      try {
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        return signature;
      } catch (sendError) {
        const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
        const isBlockhashError =
          errorMsg.includes('Blockhash not found') || errorMsg.includes('block height exceeded');

        if (isBlockhashError && attempt < maxRetries) {
          console.warn(`Blockhash expired, retrying (attempt ${attempt + 1}/${maxRetries})...`);
          continue;
        }
        throw sendError;
      }
    }
    throw new Error('Max retries exceeded');
  };

  return sendWithRetry();
}
