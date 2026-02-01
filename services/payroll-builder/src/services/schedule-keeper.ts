import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  executeSchedule,
  fetchScheduleAccount,
  deriveSchedulePda,
  ScheduleStatus,
  generatePayrunIdFromSchedule,
} from '@zurpay/sdk';
import { prisma } from '../db';
import { generateMerkleTreeForSchedule } from './merkle-generator';
import logger from '../logger';

interface KeeperConfig {
  connection: Connection;
  executorKeypair: Keypair;
  programId: PublicKey;
  checkIntervalMs: number;
}

export class ScheduleKeeper {
  private config: KeeperConfig;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: KeeperConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Schedule keeper is already running');
      return;
    }

    this.isRunning = true;
    logger.info({ interval: this.config.checkIntervalMs }, 'Starting schedule keeper');

    await this.checkAndExecuteDueSchedules();

    this.intervalId = setInterval(async () => {
      await this.checkAndExecuteDueSchedules();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Schedule keeper stopped');
  }

  async checkAndExecuteDueSchedules(): Promise<void> {
    try {
      const onChainSchedules = await prisma.recurringSchedule.findMany({
        where: {
          status: 'ACTIVE',
          onChainScheduleId: { not: null },
        },
        include: {
          org: true,
        },
      });

      const now = Math.floor(Date.now() / 1000);

      for (const dbSchedule of onChainSchedules) {
        if (!dbSchedule.onChainScheduleId || !dbSchedule.org.orgIdHex) {
          continue;
        }

        try {
          const orgId = Buffer.from(dbSchedule.org.orgIdHex, 'hex');
          const scheduleId = Buffer.from(dbSchedule.onChainScheduleId, 'hex');
          const schedulePda = deriveSchedulePda(orgId, scheduleId, this.config.programId);

          const scheduleAccount = await fetchScheduleAccount(this.config.connection, schedulePda);

          if (!scheduleAccount) {
            logger.warn({ scheduleId: dbSchedule.id }, 'On-chain schedule account not found');
            continue;
          }

          if (scheduleAccount.status !== ScheduleStatus.Active) {
            logger.debug({ scheduleId: dbSchedule.id }, 'Schedule is not active on-chain');
            continue;
          }

          if (now < scheduleAccount.nextExecution) {
            logger.debug(
              {
                scheduleId: dbSchedule.id,
                nextExecution: new Date(scheduleAccount.nextExecution * 1000),
              },
              'Schedule not yet due'
            );
            continue;
          }

          logger.info(
            {
              scheduleId: dbSchedule.id,
              orgId: dbSchedule.orgId,
              executionCount: scheduleAccount.executionCount,
            },
            'Executing due schedule'
          );

          await this.executeScheduleOnChain(
            dbSchedule,
            scheduleAccount.executionCount,
            schedulePda
          );
        } catch (err) {
          logger.error({ error: err, scheduleId: dbSchedule.id }, 'Error checking schedule');
        }
      }
    } catch (err) {
      logger.error({ error: err }, 'Error in schedule keeper check cycle');
    }
  }

  private async executeScheduleOnChain(
    dbSchedule: {
      id: string;
      orgId: string;
      onChainScheduleId: string | null;
      workerIds: string[];
      claimDeadlineDays: number;
      org: { orgIdHex: string | null };
    },
    executionCount: number,
    schedulePda: PublicKey
  ): Promise<void> {
    if (!dbSchedule.onChainScheduleId || !dbSchedule.org.orgIdHex) {
      throw new Error('Missing on-chain schedule ID or org ID');
    }

    const payrunId = generatePayrunIdFromSchedule(schedulePda, executionCount);
    const payrunIdHex = Buffer.from(payrunId).toString('hex');

    logger.info(
      { scheduleId: dbSchedule.id, payrunIdHex },
      'Generating merkle tree for scheduled payrun'
    );

    const result = await generateMerkleTreeForSchedule(
      dbSchedule.org.orgIdHex,
      payrunIdHex,
      dbSchedule.workerIds,
      dbSchedule.claimDeadlineDays
    );

    logger.info(
      { scheduleId: dbSchedule.id, merkleRoot: result.merkleRoot, totalClaims: result.totalClaims },
      'Executing schedule on-chain'
    );

    const signature = await executeSchedule(
      this.config.connection,
      this.config.executorKeypair,
      dbSchedule.org.orgIdHex,
      dbSchedule.onChainScheduleId,
      executionCount,
      result.merkleRootBytes,
      this.config.programId
    );

    logger.info(
      {
        scheduleId: dbSchedule.id,
        signature,
        payrunIdHex,
      },
      'Schedule executed on-chain successfully'
    );

    await prisma.recurringSchedule.update({
      where: { id: dbSchedule.id },
      data: {
        lastRunAt: new Date(),
        lastPayrunId: payrunIdHex,
      },
    });
  }
}

let keeperInstance: ScheduleKeeper | null = null;

export function startScheduleKeeper(config: KeeperConfig): ScheduleKeeper {
  if (keeperInstance) {
    keeperInstance.stop();
  }

  keeperInstance = new ScheduleKeeper(config);
  keeperInstance.start();
  return keeperInstance;
}

export function stopScheduleKeeper(): void {
  if (keeperInstance) {
    keeperInstance.stop();
    keeperInstance = null;
  }
}

export function getScheduleKeeper(): ScheduleKeeper | null {
  return keeperInstance;
}
