import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { ErrorCode } from '@app/shared';
import { AppError } from '../lib/errors.js';
import { isProduction } from '../config.js';

/**
 * Turns every thrown error into the shared response envelope. Unexpected
 * errors are logged in full but reported to the client without internals.
 */
export const errorHandler = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      ok: false,
      error: {
        code: ErrorCode.NotFound,
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        ok: false,
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        ok: false,
        error: {
          code: ErrorCode.BadRequest,
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    // Fastify types the handler argument as `unknown`, so narrow before use.
    const httpError = error as { statusCode?: number; message?: string };
    const status = httpError.statusCode;
    const message = httpError.message ?? 'Something went wrong';

    if (status === 429) {
      reply.status(429).send({
        ok: false,
        error: { code: ErrorCode.RateLimited, message: 'Too many requests, slow down' },
      });
      return;
    }

    if (typeof status === 'number' && status >= 400 && status < 500) {
      reply.status(status).send({
        ok: false,
        error: { code: ErrorCode.BadRequest, message },
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    reply.status(500).send({
      ok: false,
      error: {
        code: ErrorCode.Internal,
        message: isProduction ? 'Something went wrong' : message,
      },
    });
  });
});
