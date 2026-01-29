import { prisma } from '../db';
import { emailService } from './email';
import { ScheduleStatus, MemberRole } from '../generated/prisma';
import logger from '../logger';

const ADMIN_APP_URL = process.env.ADMIN_APP_URL || 'http://localhost:3000';

export interface ScheduleNotificationResult {
  scheduleId: string;
  scheduleName: string;
  orgId: string;
  emailSent: boolean;
  error?: string;
}

export interface NotifyDueSchedulesResult {
  processed: number;
  notified: number;
  errors: number;
  results: ScheduleNotificationResult[];
}

/**
 * Find schedules that are due within the specified hours window.
 * Default is 24 hours (schedules due in the next day).
 */
export async function findDueSchedules(hoursAhead: number = 24) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const schedules = await prisma.recurringSchedule.findMany({
    where: {
      status: ScheduleStatus.ACTIVE,
      nextRunAt: {
        lte: cutoff,
        gte: now,
      },
    },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          ownerWallet: true,
        },
      },
    },
  });

  return schedules;
}

/**
 * Get the owner's email for an organization.
 */
async function getOrgOwnerEmail(orgId: string): Promise<{ email: string; name?: string } | null> {
  const orgMember = await prisma.orgMember.findFirst({
    where: {
      orgId,
      role: MemberRole.OWNER,
    },
    select: {
      wallet: true,
    },
  });

  if (!orgMember) return null;

  // Try to find the worker record with email
  const worker = await prisma.worker.findFirst({
    where: {
      orgId,
      wallet: orgMember.wallet,
    },
    select: {
      email: true,
      displayName: true,
    },
  });

  if (worker?.email) {
    return { email: worker.email, name: worker.displayName || undefined };
  }

  return null;
}

/**
 * Calculate estimated total amount for a schedule based on workers.
 */
async function getEstimatedAmount(
  scheduleId: string,
  orgId: string,
  workerIds: string[]
): Promise<{ amount: string; workerCount: number }> {
  // If specific workers are assigned, use those; otherwise get all active workers
  const workers =
    workerIds.length > 0
      ? await prisma.worker.findMany({
          where: {
            id: { in: workerIds },
            orgId,
            status: 'ACTIVE',
          },
          include: {
            compPlans: {
              where: { effectiveTo: null },
              take: 1,
            },
          },
        })
      : await prisma.worker.findMany({
          where: {
            orgId,
            status: 'ACTIVE',
          },
          include: {
            compPlans: {
              where: { effectiveTo: null },
              take: 1,
            },
          },
        });

  const workersWithPlans = workers.filter((w) => w.compPlans.length > 0);
  const totalAmount = workersWithPlans.reduce(
    (sum, w) => sum + BigInt(w.compPlans[0].rateAmount),
    BigInt(0)
  );

  return {
    amount: totalAmount.toString(),
    workerCount: workersWithPlans.length,
  };
}

/**
 * Send reminder notifications for all due schedules.
 */
export async function notifyDueSchedules(hoursAhead: number = 24): Promise<NotifyDueSchedulesResult> {
  const results: ScheduleNotificationResult[] = [];

  try {
    const dueSchedules = await findDueSchedules(hoursAhead);

    logger.info({ count: dueSchedules.length, hoursAhead }, 'Found due schedules');

    for (const schedule of dueSchedules) {
      const result: ScheduleNotificationResult = {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        orgId: schedule.orgId,
        emailSent: false,
      };

      try {
        // Get owner email
        const ownerInfo = await getOrgOwnerEmail(schedule.orgId);
        if (!ownerInfo) {
          result.error = 'No owner email found';
          results.push(result);
          continue;
        }

        // Get estimated amount
        const { amount, workerCount } = await getEstimatedAmount(
          schedule.id,
          schedule.orgId,
          schedule.workerIds
        );

        if (workerCount === 0) {
          result.error = 'No active workers with compensation plans';
          results.push(result);
          continue;
        }

        // Build dashboard URL
        const dashboardUrl = `${ADMIN_APP_URL}/dashboard/schedules`;

        // Send reminder email
        const sent = await emailService.sendScheduleReminder({
          to: ownerInfo.email,
          recipientName: ownerInfo.name,
          orgName: schedule.org.name,
          scheduleName: schedule.name,
          scheduleId: schedule.id,
          workerCount,
          estimatedAmount: amount,
          currency: 'USDC',
          nextRunAt: schedule.nextRunAt!,
          dashboardUrl,
        });

        result.emailSent = sent;
        if (!sent) {
          result.error = 'Email send failed';
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ error: err, scheduleId: schedule.id }, 'Failed to send schedule reminder');
      }

      results.push(result);
    }

    const notified = results.filter((r) => r.emailSent).length;
    const errors = results.filter((r) => r.error).length;

    logger.info({ processed: results.length, notified, errors }, 'Schedule notification complete');

    return {
      processed: results.length,
      notified,
      errors,
      results,
    };
  } catch (err) {
    logger.error({ error: err }, 'Failed to process schedule notifications');
    throw err;
  }
}

/**
 * Check a single schedule and send reminder if due.
 */
export async function checkAndNotifySchedule(
  scheduleId: string
): Promise<ScheduleNotificationResult> {
  const schedule = await prisma.recurringSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          ownerWallet: true,
        },
      },
    },
  });

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const result: ScheduleNotificationResult = {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    orgId: schedule.orgId,
    emailSent: false,
  };

  if (schedule.status !== ScheduleStatus.ACTIVE) {
    result.error = 'Schedule is not active';
    return result;
  }

  const ownerInfo = await getOrgOwnerEmail(schedule.orgId);
  if (!ownerInfo) {
    result.error = 'No owner email found';
    return result;
  }

  const { amount, workerCount } = await getEstimatedAmount(
    schedule.id,
    schedule.orgId,
    schedule.workerIds
  );

  if (workerCount === 0) {
    result.error = 'No active workers with compensation plans';
    return result;
  }

  const dashboardUrl = `${ADMIN_APP_URL}/dashboard/schedules`;

  const sent = await emailService.sendScheduleReminder({
    to: ownerInfo.email,
    recipientName: ownerInfo.name,
    orgName: schedule.org.name,
    scheduleName: schedule.name,
    scheduleId: schedule.id,
    workerCount,
    estimatedAmount: amount,
    currency: 'USDC',
    nextRunAt: schedule.nextRunAt || new Date(),
    dashboardUrl,
  });

  result.emailSent = sent;
  if (!sent) {
    result.error = 'Email send failed';
  }

  return result;
}
