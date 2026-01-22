import { PublicKey, TransactionInstruction } from '@solana/web3.js';

export interface BatchPayoutItem {
  payslipId: string;
  recipientConfAccount: string;
  amount: bigint;
  encryptedAmountB64: string;
}

export interface BatchConfig {
  maxItemsPerBatch: number;
  maxTransactionSize: number;
}

const DEFAULT_CONFIG: BatchConfig = {
  maxItemsPerBatch: 10,
  maxTransactionSize: 1232,
};

export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export function estimateTransactionSize(instructions: TransactionInstruction[]): number {
  let size = 0;
  size += 1;
  size += 32;
  size += 32;
  size += 64;

  for (const ix of instructions) {
    size += 32;
    size += 1 + ix.keys.length;
    size += 2 + ix.data.length;
  }

  return size;
}

export function optimizeBatches(
  items: BatchPayoutItem[],
  buildInstruction: (item: BatchPayoutItem) => TransactionInstruction,
  config: BatchConfig = DEFAULT_CONFIG
): BatchPayoutItem[][] {
  const batches: BatchPayoutItem[][] = [];
  let currentBatch: BatchPayoutItem[] = [];
  let currentInstructions: TransactionInstruction[] = [];
  let currentSize = 0;

  for (const item of items) {
    const instruction = buildInstruction(item);
    const instructionSize = 32 + 1 + instruction.keys.length + 2 + instruction.data.length;

    const wouldExceedSize = currentSize + instructionSize > config.maxTransactionSize;
    const wouldExceedCount = currentBatch.length >= config.maxItemsPerBatch;

    if (wouldExceedSize || wouldExceedCount) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [];
      currentInstructions = [];
      currentSize = 100;
    }

    currentBatch.push(item);
    currentInstructions.push(instruction);
    currentSize += instructionSize;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export interface BatchExecutionResult {
  batchIndex: number;
  success: boolean;
  itemCount: number;
  signature?: string;
  error?: string;
  processedItems: string[];
  failedItems: string[];
}

export interface BatchExecutionSummary {
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  results: BatchExecutionResult[];
}

export function summarizeBatchExecution(results: BatchExecutionResult[]): BatchExecutionSummary {
  const summary: BatchExecutionSummary = {
    totalBatches: results.length,
    successfulBatches: 0,
    failedBatches: 0,
    totalItems: 0,
    processedItems: 0,
    failedItems: 0,
    results,
  };

  for (const result of results) {
    summary.totalItems += result.itemCount;

    if (result.success) {
      summary.successfulBatches++;
      summary.processedItems += result.processedItems.length;
    } else {
      summary.failedBatches++;
      summary.failedItems += result.failedItems.length;
    }
  }

  return summary;
}

export function buildBatchPayoutInstruction(
  items: BatchPayoutItem[],
  vaultPda: PublicKey,
  incoProgramId: PublicKey
): TransactionInstruction {
  const batchData = Buffer.alloc(4 + items.length * 72);
  batchData.writeUInt32LE(items.length, 0);

  let offset = 4;
  for (const item of items) {
    const recipientPubkey = new PublicKey(item.recipientConfAccount);
    recipientPubkey.toBuffer().copy(batchData, offset);
    offset += 32;

    batchData.writeBigUInt64LE(item.amount, offset);
    offset += 8;

    const encryptedData = Buffer.from(item.encryptedAmountB64, 'base64');
    encryptedData.copy(batchData, offset, 0, Math.min(32, encryptedData.length));
    offset += 32;
  }

  const keys = [
    { pubkey: vaultPda, isSigner: true, isWritable: true },
    ...items.map((item) => ({
      pubkey: new PublicKey(item.recipientConfAccount),
      isSigner: false,
      isWritable: true,
    })),
  ];

  return new TransactionInstruction({
    programId: incoProgramId,
    keys,
    data: batchData,
  });
}

export async function executeBatchWithRetry(
  executeFn: () => Promise<string>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<{ success: boolean; signature?: string; error?: string }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const signature = await executeFn();
      return { success: true, signature };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable =
        lastError.message.includes('blockhash') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('rate limit');

      if (!isRetryable) {
        break;
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  return { success: false, error: lastError?.message || 'Unknown error' };
}
