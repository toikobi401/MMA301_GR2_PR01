import type { FastifyInstance } from 'fastify';
import { pingDatabase } from '../lib/db.js';
import { pingRedis } from '../lib/redis.js';

/**
 * `/health` is cheap and used by Docker's healthcheck.
 * `/health/ready` actually touches the dependencies.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true as const,
    data: { status: 'up', uptime: Math.round(process.uptime()) },
  }));

  app.get('/health/ready', async (_request, reply) => {
    const [database, cache] = await Promise.all([pingDatabase(), pingRedis()]);
    const healthy = database && cache;

    reply.status(healthy ? 200 : 503);
    return {
      ok: healthy,
      data: { database, cache },
      ...(healthy
        ? {}
        : { error: { code: 'DEPENDENCY_DOWN', message: 'One or more dependencies are unavailable' } }),
    };
  });
}
