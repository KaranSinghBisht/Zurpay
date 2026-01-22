import { prisma } from '../db';
import { IdempotencyStatus } from '../generated/prisma';

const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotencyResult<T> {
  isNew: boolean;
  response?: T;
  error?: string;
}

export async function withIdempotency<T>(
  scope: string,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);

  // Use atomic create to acquire lock - if key exists, this will throw unique constraint error
  try {
    await prisma.idempotencyKey.create({
      data: {
        scope,
        key,
        status: IdempotencyStatus.STARTED,
        expiresAt,
      },
    });
  } catch (err: any) {
    // Unique constraint violation - key already exists
    if (err?.code === 'P2002') {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope, key } },
      });

      if (existing) {
        if (existing.status === IdempotencyStatus.COMPLETED && existing.response) {
          return JSON.parse(existing.response) as T;
        }
        if (existing.status === IdempotencyStatus.FAILED && existing.error) {
          throw new Error(existing.error);
        }
        if (existing.status === IdempotencyStatus.STARTED) {
          throw new Error('Operation already in progress');
        }
      }
    }
    throw err;
  }

  try {
    const result = await fn();

    await prisma.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: {
        status: IdempotencyStatus.COMPLETED,
        response: JSON.stringify(result),
      },
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await prisma.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: {
        status: IdempotencyStatus.FAILED,
        error: errorMessage,
      },
    });

    throw err;
  }
}

export async function cleanupExpiredKeys(): Promise<number> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
