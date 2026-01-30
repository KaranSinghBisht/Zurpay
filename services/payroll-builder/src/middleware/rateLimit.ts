import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyPrefix?: string;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  message: 'Too many requests, please try again later.',
  keyPrefix: 'rl:',
};

let redis: Redis | null = null;
const memoryStore = new Map<string, RateLimitEntry>();

function getRedisClient(): Redis | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const requireRedis = process.env.REQUIRE_REDIS_RATE_LIMIT === 'true';

  if (!redisUrl) {
    if (isProduction && requireRedis) {
      throw new Error(
        'FATAL: REDIS_URL is required in production when REQUIRE_REDIS_RATE_LIMIT=true. ' +
          'In-memory rate limiting is not suitable for horizontal scaling.'
      );
    }
    if (isProduction) {
      console.warn(
        'WARN: REDIS_URL not set in production. Rate limiting will use in-memory store ' +
          '(not suitable for horizontal scaling). Set REQUIRE_REDIS_RATE_LIMIT=true to enforce Redis.'
      );
    }
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('Redis connected for rate limiting');
    });

    redis.connect().catch(() => {
      console.warn('WARN: Redis connection failed, falling back to in-memory rate limiting');
      redis = null;
    });

    return redis;
  } catch {
    return null;
  }
}

function getClientIdentifier(req: Request): string {
  if (req.ips && req.ips.length > 0) {
    return req.ips[0];
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

async function checkRateLimitRedis(
  client: Redis,
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<{ count: number; resetAt: number; isLimited: boolean }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = client.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now.toString(), `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;
  const resetAt = now + windowMs;

  return {
    count,
    resetAt,
    isLimited: count > maxRequests,
  };
}

function checkRateLimitMemory(
  key: string,
  windowMs: number,
  maxRequests: number
): { count: number; resetAt: number; isLimited: boolean } {
  const now = Date.now();
  let entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  } else {
    entry.count++;
  }

  return {
    count: entry.count,
    resetAt: entry.resetAt,
    isLimited: entry.count > maxRequests,
  };
}

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 60000);
}

export function rateLimit(options: Partial<RateLimitOptions> = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const redisClient = getRedisClient();

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientIdentifier(req);
    const key = `${config.keyPrefix}${clientId}`;

    try {
      let result: { count: number; resetAt: number; isLimited: boolean };

      if (redisClient) {
        result = await checkRateLimitRedis(redisClient, key, config.windowMs, config.maxRequests);
      } else {
        result = checkRateLimitMemory(key, config.windowMs, config.maxRequests);
      }

      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - result.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

      if (result.isLimited) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: config.message,
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        });
        return;
      }

      next();
    } catch (err) {
      console.error('Rate limit error:', err);
      next();
    }
  };
}

export const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many attempts, please wait before trying again.',
  keyPrefix: 'rl:strict:',
});

export const readRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  maxRequests: 60,
  message: 'Too many requests, please slow down.',
  keyPrefix: 'rl:read:',
});

export const apiRateLimit = rateLimit({ keyPrefix: 'rl:api:' });
