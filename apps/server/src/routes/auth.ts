import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import {
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  type AuthSession,
  type User,
} from '@app/shared';
import { sql } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import {
  accessTokenTtlSeconds,
  findLiveRefreshToken,
  generateRefreshToken,
  revokeAllForUser,
  revokeRefreshToken,
  storeRefreshToken,
} from '../lib/tokens.js';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  chips: string;
  created_at: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Argon2id is the current recommendation for password hashing: memory-hard,
 * so a GPU cannot brute-force it the way it can with a fast hash.
 */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function authRoutes(app: FastifyInstance) {
  async function issueSession(user: User): Promise<AuthSession> {
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
    const { token, hash } = generateRefreshToken();
    await storeRefreshToken(user.id, hash);

    return {
      user,
      tokens: {
        accessToken,
        refreshToken: token,
        expiresIn: accessTokenTtlSeconds(),
      },
    };
  }

  app.post('/register', async (request, reply) => {
    const body = registerBodySchema.parse(request.body);

    const existing = await sql<Array<{ id: string }>>`
      SELECT id FROM users WHERE email = ${body.email} LIMIT 1
    `;
    if (existing.length > 0) {
      throw AppError.conflict('An account with that email already exists');
    }

    const passwordHash = await argon2.hash(body.password, ARGON_OPTIONS);

    const rows = await sql<UserRow[]>`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${body.email}, ${passwordHash}, ${body.displayName})
      RETURNING id, email, display_name, role, chips, created_at
    `;

    const row = rows[0];
    if (!row) throw AppError.internal('Failed to create the account');

    // Seed the ledger so the starting balance has a transaction behind it.
    await sql`
      INSERT INTO chip_transactions (user_id, kind, amount, balance_after, reference)
      VALUES (${row.id}, 'bonus', ${Number(row.chips)}, ${Number(row.chips)}, 'welcome')
    `;
    await sql`INSERT INTO player_stats (user_id) VALUES (${row.id})`;

    reply.status(201);
    return { ok: true as const, data: await issueSession(toUser(row)) };
  });

  app.post('/login', async (request) => {
    const body = loginBodySchema.parse(request.body);

    const rows = await sql<Array<UserRow & { password_hash: string }>>`
      SELECT id, email, display_name, role, chips, created_at, password_hash
      FROM users WHERE email = ${body.email} LIMIT 1
    `;

    const row = rows[0];

    // Verify against a dummy hash when the user is missing, so the response
    // time does not reveal whether the email is registered.
    const hash =
      row?.password_hash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

    let valid = false;
    try {
      valid = await argon2.verify(hash, body.password);
    } catch {
      valid = false;
    }

    if (!row || !valid) {
      throw AppError.unauthorized('Incorrect email or password');
    }

    return { ok: true as const, data: await issueSession(toUser(row)) };
  });

  app.post('/refresh', async (request) => {
    const body = refreshBodySchema.parse(request.body);

    const stored = await findLiveRefreshToken(body.refreshToken);
    if (!stored) throw AppError.unauthorized('Invalid or expired refresh token');

    // Rotate: the old token dies the moment a new one is issued, so a stolen
    // token is usable at most once before the real user's next refresh
    // invalidates it.
    await revokeRefreshToken(stored.id);

    const rows = await sql<UserRow[]>`
      SELECT id, email, display_name, role, chips, created_at
      FROM users WHERE id = ${stored.userId} LIMIT 1
    `;

    const row = rows[0];
    if (!row) throw AppError.unauthorized('Account no longer exists');

    return { ok: true as const, data: await issueSession(toUser(row)) };
  });

  app.post('/logout', { onRequest: [app.requireAuth] }, async (request) => {
    const body = refreshBodySchema.partial().parse(request.body ?? {});

    if (body.refreshToken) {
      const stored = await findLiveRefreshToken(body.refreshToken);
      if (stored) await revokeRefreshToken(stored.id);
    } else if (request.claims) {
      await revokeAllForUser(request.claims.sub);
    }

    return { ok: true as const, data: { loggedOut: true } };
  });

  app.get('/me', { onRequest: [app.requireAuth] }, async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const rows = await sql<UserRow[]>`
      SELECT id, email, display_name, role, chips, created_at
      FROM users WHERE id = ${userId} LIMIT 1
    `;

    const row = rows[0];
    if (!row) throw AppError.notFound('Account not found');

    return { ok: true as const, data: { ...toUser(row), chips: Number(row.chips) } };
  });
}
