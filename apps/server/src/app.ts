import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, isDevelopment } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { friendRoutes, userRoutes } from './routes/friends.js';
import { handRoutes } from './routes/hands.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { healthRoutes } from './routes/health.js';
import { realtimeRoutes } from './routes/realtime.js';
import { tableRoutes } from './routes/tables.js';
import { walletRoutes } from './routes/wallet.js';

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
    // The default is only GET, HEAD and POST, which blocks the rest in browsers
    // while every non-browser client keeps working.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // shortcut: in-memory store, so the limit is per process; move to a shared store if the server ever runs as more than one instance.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  await app.register(errorHandler);
  await app.register(authPlugin);

  await app.register(healthRoutes);

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(walletRoutes, { prefix: '/api/v1/wallet' });
  await app.register(tableRoutes, { prefix: '/api/v1/tables' });
  await app.register(friendRoutes, { prefix: '/api/v1/friends' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(handRoutes, { prefix: '/api/v1/hands' });
  await app.register(leaderboardRoutes, { prefix: '/api/v1/leaderboard' });
  await app.register(realtimeRoutes);

  return app;
}
