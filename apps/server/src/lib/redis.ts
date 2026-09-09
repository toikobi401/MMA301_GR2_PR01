import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * Redis backs refresh-token revocation and rate limiting. For the realtime
 * variant of the project it also carries pub/sub between server instances.
 */
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 200, 3000),
});

export async function pingRedis(): Promise<boolean> {
  try {
    const reply = await redis.ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
