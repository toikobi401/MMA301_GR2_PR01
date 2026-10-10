import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { JwtClaims, UserRole } from '@app/shared';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Rejects the request unless a valid access token is present. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Rejects the request unless the caller holds one of `roles`. */
    requireRole: (
      ...roles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    claims?: JwtClaims;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: JwtClaims;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.ACCESS_TOKEN_TTL },
  });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    try {
      const claims = await request.jwtVerify<JwtClaims>();
      request.claims = claims;
    } catch {
      throw AppError.unauthorized('Invalid or expired access token');
    }
  });

  app.decorate(
    'requireRole',
    (...roles: UserRole[]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        await app.requireAuth(request, reply);
        if (!request.claims || !roles.includes(request.claims.role)) {
          throw AppError.forbidden('Insufficient permissions');
        }
      },
  );
});
