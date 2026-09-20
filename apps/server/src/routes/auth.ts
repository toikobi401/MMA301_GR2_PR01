import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  type AuthSession,
  type User,
} from '@app/shared';
import {
  chipTransactions,
  EMAIL_COLLATION,
  isDuplicateKeyError,
  playerStats,
  users,
  type UserDoc,
} from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import {
  accessTokenTtlSeconds,
  findLiveRefreshToken,
  generateRefreshToken,
  revokeAllForUser,
  revokeRefreshToken,
  storeRefreshToken,
} from '../lib/tokens.js';

const STARTING_CHIPS = 10_000;

function toUser(doc: UserDoc): User {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    displayName: doc.displayName,
    role: doc.role,
    createdAt: doc.createdAt.toISOString(),
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

/**
 * Refuses a banned account, and lifts an expired ban on the way past.
 *
 * Checked on every path that issues a token, not only login — otherwise a
 * banned player simply keeps refreshing the session they already held.
 */
async function assertNotBanned(doc: UserDoc): Promise<void> {
  const ban = doc.ban;
  if (!ban) return;

  if (ban.expiresAt && ban.expiresAt.getTime() <= Date.now()) {
    await users().updateOne({ _id: doc._id }, { $set: { ban: null } });
    doc.ban = null;
    return;
  }

  const until = ban.expiresAt
    ? ` until ${ban.expiresAt.toISOString()}`
    : '';
  throw AppError.forbidden(`This account is banned${until}: ${ban.reason}`);
}

export async function authRoutes(app: FastifyInstance) {
  async function issueSession(doc: UserDoc): Promise<AuthSession> {
    const user = toUser(doc);
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
    const { token, hash } = generateRefreshToken();
    await storeRefreshToken(doc._id, hash);

    return {
      user,
      tokens: { accessToken, refreshToken: token, expiresIn: accessTokenTtlSeconds() },
    };
  }

  app.post('/register', async (request, reply) => {
    const body = registerBodySchema.parse(request.body);

    const now = new Date();
    const doc: UserDoc = {
      _id: new ObjectId(),
      email: body.email,
      passwordHash: await argon2.hash(body.password, ARGON_OPTIONS),
      displayName: body.displayName,
      role: 'user',
      chips: STARTING_CHIPS,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Let the unique index decide. Checking first and inserting after would
      // leave a window where two concurrent registrations both pass the check.
      await users().insertOne(doc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw AppError.conflict('An account with that email already exists');
      }
      throw error;
    }

    // Seed the ledger so the starting balance has a transaction behind it.
    await chipTransactions().insertOne({
      _id: new ObjectId(),
      userId: doc._id,
      kind: 'bonus',
      amount: STARTING_CHIPS,
      balanceAfter: STARTING_CHIPS,
      reference: 'welcome',
      createdAt: now,
    });

    await playerStats().insertOne({
      _id: new ObjectId(),
      userId: doc._id,
      handsPlayed: 0,
      handsWon: 0,
      biggestPot: 0,
      netChips: 0,
      updatedAt: now,
    });

    reply.status(201);
    return { ok: true as const, data: await issueSession(doc) };
  });

  app.post('/login', async (request) => {
    const body = loginBodySchema.parse(request.body);

    const doc = await users().findOne(
      { email: body.email },
      { collation: EMAIL_COLLATION },
    );

    // Verify against a dummy hash when the user is missing, so the response
    // time does not reveal whether the email is registered.
    const hash =
      doc?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

    let valid = false;
    try {
      valid = await argon2.verify(hash, body.password);
    } catch {
      valid = false;
    }

    if (!doc || !valid) {
      throw AppError.unauthorized('Incorrect email or password');
    }

    await assertNotBanned(doc);

    return { ok: true as const, data: await issueSession(doc) };
  });

  app.post('/refresh', async (request) => {
    const body = refreshBodySchema.parse(request.body);

    const stored = await findLiveRefreshToken(body.refreshToken);
    if (!stored) throw AppError.unauthorized('Invalid or expired refresh token');

    // Rotate: the old token dies the moment a new one is issued, so a stolen
    // token is usable at most once. The revoke reports whether this call won,
    // so two concurrent refreshes cannot both mint a session.
    const revoked = await revokeRefreshToken(stored.id);
    if (!revoked) throw AppError.unauthorized('Invalid or expired refresh token');

    const doc = await users().findOne({ _id: stored.userId });
    if (!doc) throw AppError.unauthorized('Account no longer exists');

    await assertNotBanned(doc);

    return { ok: true as const, data: await issueSession(doc) };
  });

  app.post('/logout', { onRequest: [app.requireAuth] }, async (request) => {
    const body = refreshBodySchema.partial().parse(request.body ?? {});

    if (body.refreshToken) {
      const stored = await findLiveRefreshToken(body.refreshToken);
      if (stored) await revokeRefreshToken(stored.id);
    } else if (request.claims) {
      await revokeAllForUser(new ObjectId(request.claims.sub));
    }

    return { ok: true as const, data: { loggedOut: true } };
  });

  app.get('/me', { onRequest: [app.requireAuth] }, async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const doc = await users().findOne({ _id: new ObjectId(userId) });
    if (!doc) throw AppError.notFound('Account not found');

    return { ok: true as const, data: { ...toUser(doc), chips: doc.chips } };
  });
}
