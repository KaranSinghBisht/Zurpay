import { PrismaClient } from './generated/prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Global for connection pooling in serverless environments
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    // For serverless (Vercel), use connection pooling via @prisma/adapter-pg
    const pool = new Pool({
        connectionString: databaseUrl,
        max: 10, // Lower for serverless
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });

    globalForPrisma.pool = pool;

    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        adapter,
    });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Re-export types from generated client
export * from './generated/prisma';
