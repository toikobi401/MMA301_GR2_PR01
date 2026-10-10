import type { FastifyInstance } from 'fastify';
import { pingDatabase } from '../lib/db.js';

/**
 * `/health` is cheap and used by Docker's healthcheck.
 * `/health/ready` actually touches the database.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true as const,
    data: { status: 'up', uptime: Math.round(process.uptime()) },
  }));

  app.get('/health/ready', async (_request, reply) => {
    const database = await pingDatabase();

    reply.status(database ? 200 : 503);
    return {
      ok: database,
      data: { database },
      ...(database
        ? {}
        : { error: { code: 'DEPENDENCY_DOWN', message: 'The database is unavailable' } }),
    };
  });
}
