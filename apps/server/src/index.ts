import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDatabase } from './lib/db.js';
import { closeRedis } from './lib/redis.js';

const app = await buildApp();

/**
 * Docker sends SIGTERM on `stop`. Draining in-flight requests before closing
 * the pools avoids dropped connections and noisy errors on every restart.
 */
async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down');
  const timer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  timer.unref();

  try {
    await app.close();
    await Promise.allSettled([closeDatabase(), closeRedis()]);
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'Unhandled rejection');
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error({ err: error }, 'Failed to start server');
  process.exit(1);
}
