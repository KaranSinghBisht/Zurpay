import { prisma } from '../db';
import { PaymentRequestStatus, PaylinkStatus } from '../generated/prisma';

export async function cleanupExpiredPaymentRequests(): Promise<number> {
  const result = await prisma.paymentRequest.updateMany({
    where: {
      status: PaymentRequestStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: PaymentRequestStatus.EXPIRED,
    },
  });

  if (result.count > 0) {
    console.log(`[Cleanup] Expired ${result.count} payment request(s)`);
  }

  return result.count;
}

export async function cleanupExpiredPaylinks(): Promise<number> {
  const result = await prisma.paylink.updateMany({
    where: {
      status: PaylinkStatus.ACTIVE,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: PaylinkStatus.EXPIRED,
    },
  });

  if (result.count > 0) {
    console.log(`[Cleanup] Expired ${result.count} paylink(s)`);
  }

  return result.count;
}

export async function cleanupExpiredClaimTokens(): Promise<number> {
  const result = await prisma.claimToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      usedAt: null,
    },
  });

  if (result.count > 0) {
    console.log(`[Cleanup] Deleted ${result.count} expired claim token(s)`);
  }

  return result.count;
}

export async function runAllCleanupTasks(): Promise<{
  paymentRequests: number;
  paylinks: number;
  claimTokens: number;
}> {
  const [paymentRequests, paylinks, claimTokens] = await Promise.all([
    cleanupExpiredPaymentRequests(),
    cleanupExpiredPaylinks(),
    cleanupExpiredClaimTokens(),
  ]);

  return { paymentRequests, paylinks, claimTokens };
}

let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupScheduler(intervalMs: number = 60 * 60 * 1000): void {
  if (cleanupInterval) {
    console.warn('[Cleanup] Scheduler already running');
    return;
  }

  console.log(`[Cleanup] Starting scheduler with ${intervalMs / 1000}s interval`);

  runAllCleanupTasks().catch((err) => console.error('[Cleanup] Initial run failed:', err));

  cleanupInterval = setInterval(() => {
    runAllCleanupTasks().catch((err) => console.error('[Cleanup] Scheduled run failed:', err));
  }, intervalMs);
}

export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Cleanup] Scheduler stopped');
  }
}
