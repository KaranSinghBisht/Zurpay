import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
} from '@solana/web3.js';
import { ZURPAY_PROGRAM_ID } from './constants';
import { hexToBytes, deriveOrgPda, derivePayrunPda } from './utils';
import { createHash } from 'crypto';

export const SCHEDULE_SEED = Buffer.from('schedule');

export enum ScheduleFrequency {
  Weekly = 0,
  Biweekly = 1,
  Monthly = 2,
  SemiMonthly = 3,
}

export enum ScheduleStatus {
  Active = 0,
  Paused = 1,
  Cancelled = 2,
}

export function deriveSchedulePda(
  orgId: Uint8Array,
  scheduleId: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([SCHEDULE_SEED, orgId, scheduleId], programId);
  return pda;
}

export function generatePayrunIdFromSchedule(
  scheduleKey: PublicKey,
  executionCount: number
): Uint8Array {
  const data = Buffer.concat([
    scheduleKey.toBuffer(),
    Buffer.from(new Uint32Array([executionCount]).buffer),
  ]);
  return createHash('sha256').update(data).digest();
}

export interface CreateScheduleAccounts {
  admin: PublicKey;
  org: PublicKey;
  schedule: PublicKey;
}

export function buildCreateScheduleInstruction(
  accounts: CreateScheduleAccounts,
  scheduleId: Uint8Array,
  frequency: ScheduleFrequency,
  firstExecution: number,
  totalEmployees: number,
  claimWindowDays: number,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x18, 0x2b, 0x67, 0x5f, 0x90, 0x4a, 0x3c, 0xd1]);

  const encodeI64LE = (value: number): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(value), 0);
    return buf;
  };

  const encodeU32LE = (value: number): Buffer => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
  };

  const data = Buffer.concat([
    discriminator,
    Buffer.from(scheduleId),
    Buffer.from([frequency]),
    encodeI64LE(firstExecution),
    encodeU32LE(totalEmployees),
    Buffer.from([claimWindowDays]),
  ]);

  const keys = [
    { pubkey: accounts.admin, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.schedule, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data,
  });
}

export interface ExecuteScheduleAccounts {
  executor: PublicKey;
  org: PublicKey;
  schedule: PublicKey;
  payrun: PublicKey;
}

export function buildExecuteScheduleInstruction(
  accounts: ExecuteScheduleAccounts,
  merkleRoot: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x7b, 0x3a, 0x5e, 0x91, 0x2c, 0x8f, 0x4d, 0x06]);

  const data = Buffer.concat([discriminator, Buffer.from(merkleRoot)]);

  const keys = [
    { pubkey: accounts.executor, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.schedule, isSigner: false, isWritable: true },
    { pubkey: accounts.payrun, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data,
  });
}

export interface PauseScheduleAccounts {
  admin: PublicKey;
  org: PublicKey;
  schedule: PublicKey;
}

export function buildPauseScheduleInstruction(
  accounts: PauseScheduleAccounts,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x4c, 0x91, 0x2f, 0x7a, 0x5b, 0xe3, 0x08, 0x9d]);

  const keys = [
    { pubkey: accounts.admin, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.schedule, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data: discriminator,
  });
}

export interface ResumeScheduleAccounts {
  admin: PublicKey;
  org: PublicKey;
  schedule: PublicKey;
}

export function buildResumeScheduleInstruction(
  accounts: ResumeScheduleAccounts,
  nextExecution: number,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
  const discriminator = Buffer.from([0x5d, 0xa2, 0x30, 0x8b, 0x6c, 0xf4, 0x19, 0xae]);

  const encodeI64LE = (value: number): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(value), 0);
    return buf;
  };

  const data = Buffer.concat([discriminator, encodeI64LE(nextExecution)]);

  const keys = [
    { pubkey: accounts.admin, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.schedule, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    programId,
    keys,
    data,
  });
}

export async function createSchedule(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  scheduleIdHex: string,
  frequency: ScheduleFrequency,
  firstExecution: Date,
  totalEmployees: number,
  claimWindowDays: number,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const scheduleId = hexToBytes(scheduleIdHex);
  const org = deriveOrgPda(orgId, programId);
  const schedule = deriveSchedulePda(orgId, scheduleId, programId);

  const instruction = buildCreateScheduleInstruction(
    {
      admin: wallet.publicKey,
      org,
      schedule,
    },
    scheduleId,
    frequency,
    Math.floor(firstExecution.getTime() / 1000),
    totalEmployees,
    claimWindowDays,
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

export async function executeSchedule(
  connection: Connection,
  executor: Keypair,
  orgIdHex: string,
  scheduleIdHex: string,
  executionCount: number,
  merkleRoot: Uint8Array,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const scheduleId = hexToBytes(scheduleIdHex);
  const org = deriveOrgPda(orgId, programId);
  const schedule = deriveSchedulePda(orgId, scheduleId, programId);

  const payrunId = generatePayrunIdFromSchedule(schedule, executionCount);
  const payrun = derivePayrunPda(orgId, payrunId, programId);

  const instruction = buildExecuteScheduleInstruction(
    {
      executor: executor.publicKey,
      org,
      schedule,
      payrun,
    },
    merkleRoot,
    programId
  );

  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = executor.publicKey;

  transaction.sign(executor);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

  return signature;
}

export async function pauseSchedule(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  scheduleIdHex: string,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const scheduleId = hexToBytes(scheduleIdHex);
  const org = deriveOrgPda(orgId, programId);
  const schedule = deriveSchedulePda(orgId, scheduleId, programId);

  const instruction = buildPauseScheduleInstruction(
    {
      admin: wallet.publicKey,
      org,
      schedule,
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

export async function resumeSchedule(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  orgIdHex: string,
  scheduleIdHex: string,
  nextExecution: Date,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
  const orgId = hexToBytes(orgIdHex);
  const scheduleId = hexToBytes(scheduleIdHex);
  const org = deriveOrgPda(orgId, programId);
  const schedule = deriveSchedulePda(orgId, scheduleId, programId);

  const instruction = buildResumeScheduleInstruction(
    {
      admin: wallet.publicKey,
      org,
      schedule,
    },
    Math.floor(nextExecution.getTime() / 1000),
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

export interface ScheduleAccountData {
  org: PublicKey;
  scheduleId: Uint8Array;
  frequency: ScheduleFrequency;
  nextExecution: number;
  lastExecution: number;
  totalEmployees: number;
  claimWindowDays: number;
  executionCount: number;
  status: ScheduleStatus;
  createdAt: number;
  bump: number;
}

export async function fetchScheduleAccount(
  connection: Connection,
  schedulePda: PublicKey
): Promise<ScheduleAccountData | null> {
  const accountInfo = await connection.getAccountInfo(schedulePda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  let offset = 8;

  const org = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const scheduleId = data.slice(offset, offset + 32);
  offset += 32;

  const frequency = data[offset] as ScheduleFrequency;
  offset += 1;

  const nextExecution = Number(data.readBigInt64LE(offset));
  offset += 8;

  const lastExecution = Number(data.readBigInt64LE(offset));
  offset += 8;

  const totalEmployees = data.readUInt32LE(offset);
  offset += 4;

  const claimWindowDays = data[offset];
  offset += 1;

  const executionCount = data.readUInt32LE(offset);
  offset += 4;

  const status = data[offset] as ScheduleStatus;
  offset += 1;

  const createdAt = Number(data.readBigInt64LE(offset));
  offset += 8;

  const bump = data[offset];

  return {
    org,
    scheduleId,
    frequency,
    nextExecution,
    lastExecution,
    totalEmployees,
    claimWindowDays,
    executionCount,
    status,
    createdAt,
    bump,
  };
}
