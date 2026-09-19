import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, isDevelopment } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { walletRoutes } from './routes/wallet.js';
import { redis } from './lib/redis.js';

/**
 * Builds the Fastify instance without starting it, so tests can drive the
 * app through `inject()` with no open sockets.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: isDevelopment
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(helmet, {
    // This is a JSON API consumed from another origin (the web client, and
    // native apps which send no Origin at all). The default
    // Cross-Origin-Resource-Policy of `same-origin` makes browsers discard
    // the response even when CORS itself allows it.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS,
    credentials: true,
  });

  // Redis-backed so the limit holds across every server instance.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) => request.ip,
  });

  await app.register(errorHandler);
  await app.register(authPlugin);

  await app.register(healthRoutes);

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(walletRoutes, { prefix: '/api/v1/wallet' });

  return app;
}
