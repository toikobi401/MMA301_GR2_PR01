import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  banUserBodySchema,
  closeTableBodySchema,
  createTableBodySchema,
  setRoleBodySchema,
  type ManagedTable,
  type ManagedUser,
} from '@app/shared';
import { peekTable, releaseTable } from '../game/registry.js';
import {
  playerStats,
  pokerTables,
  users,
  type PokerTableDoc,
  type UserDoc,
} from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { revokeAllForUser } from '../lib/tokens.js';

/**
 * Tournament control.
 *
 * Every route here is gated on the moderator or admin role. Players cannot
 * open tables at all — that route moved here deliberately, so the lobby is a
 * curated set of tables rather than whatever anyone happened to create.
 */

function toManagedUser(doc: UserDoc, handsPlayed: number): ManagedUser {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    displayName: doc.displayName,
    role: doc.role,
    createdAt: doc.createdAt.toISOString(),
    chips: doc.chips,
    isBot: doc.isBot === true,
    ban: doc.ban
      ? {
          reason: doc.ban.reason,
          bannedAt: doc.ban.bannedAt.toISOString(),
          bannedBy: doc.ban.bannedBy.toHexString(),
          expiresAt: doc.ban.expiresAt?.toISOString() ?? null,
        }
      : null,
    handsPlayed,
  };
}

function toManagedTable(doc: PokerTableDoc, ownerName: string | null): ManagedTable {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    maxSeats: doc.maxSeats,
    seatedCount: doc.seats.filter((seat) => seat.userId !== null).length,
    smallBlind: doc.smallBlind,
    bigBlind: doc.bigBlind,
    minBuyIn: doc.minBuyIn,
    maxBuyIn: doc.maxBuyIn,
    isPrivate: doc.isPrivate,
    status: doc.status,
    botCount: doc.seats.filter((seat) => seat.botProfile != null).length,
    createdAt: doc.createdAt.toISOString(),
    ownerName,
    handNumber: doc.handNumber,
    autoDeal: doc.autoDeal === true,
    autoFillBots: doc.autoFillBots === true,
    joinCode: doc.joinCode,
    seatedPlayers: doc.seats
      .filter((seat) => seat.userId !== null)
      .map((seat) => ({
        seat: seat.seat,
        userId: seat.userId?.toHexString() ?? '',
        displayName: seat.displayName ?? 'Unknown',
        stack: seat.stack,
        isBot: seat.botProfile != null,
      })),
  };
}

export async function moderationRoutes(app: FastifyInstance) {
  // Everything below requires a moderator. `requireRole` already chains
  // through requireAuth, so an unauthenticated request is rejected first.
  app.addHook('onRequest', app.requireRole('moderator', 'admin'));

  // ------------------------------------------------------------- tables

  app.get('/tables', async () => {
    const docs = await pokerTables().find({}).sort({ createdAt: -1 }).limit(100).toArray();

    const ownerIds = docs
      .map((doc) => doc.ownerId)
      .filter((id): id is ObjectId => id !== null);

    const owners = await users()
      .find({ _id: { $in: ownerIds } }, { projection: { displayName: 1 } })
      .toArray();

    const names = new Map(owners.map((owner) => [owner._id.toHexString(), owner.displayName]));

    return {
      ok: true as const,
      data: {
        items: docs.map((doc) =>
          toManagedTable(doc, doc.ownerId ? (names.get(doc.ownerId.toHexString()) ?? null) : null),
        ),
      },
    };
  });

  /**
   * Opens a table.
   *
   * This is the only way a table gets created now. Ordinary players have no
   * equivalent route, which is what makes the lobby a curated list.
   */
  app.post('/tables', async (request, reply) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const body = createTableBodySchema.parse(request.body);

    const doc: PokerTableDoc = {
      _id: new ObjectId(),
      name: body.name,
      ownerId: new ObjectId(claim),
      maxSeats: body.maxSeats,
      smallBlind: body.smallBlind,
      bigBlind: body.bigBlind,
      minBuyIn: body.minBuyIn,
      maxBuyIn: body.maxBuyIn,
      isPrivate: body.isPrivate,
      joinCode: body.isPrivate ? makeJoinCode() : null,
      status: 'open',
      seats: Array.from({ length: body.maxSeats }, (_, index) => ({
        seat: index,
        userId: null,
        displayName: null,
        stack: 0,
        sittingOut: false,
        botProfile: null,
        joinedAt: new Date(),
      })),
      handNumber: 0,
      buttonSeat: 0,
      createdAt: new Date(),
    };

    await pokerTables().insertOne(doc);

    reply.status(201);
    return { ok: true as const, data: toManagedTable(doc, null) };
  });

  /**
   * Closes a table.
   *
   * Refuses while a hand is running rather than killing it: cutting a hand
   * short would strand the pot, and the wait is at most thirty seconds.
   */
  app.delete('/tables/:id', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = closeTableBodySchema.parse(request.body ?? {});

    if (!ObjectId.isValid(id)) throw AppError.notFound('Table not found');
    const tableId = new ObjectId(id);

    const live = peekTable(id);
    const hand = live?.currentHand;
    if (hand && hand.street !== 'complete') {
      throw AppError.conflict('A hand is in progress; try again when it finishes');
    }

    const result = await pokerTables().updateOne(
      { _id: tableId },
      {
        $set: {
          status: 'closed',
          closedAt: new Date(),
          closedBy: new ObjectId(claim),
          closeReason: body.reason ?? null,
          // Stop it dealing itself another hand on the way out.
          autoDeal: false,
          autoFillBots: false,
        },
      },
    );

    if (result.matchedCount === 0) throw AppError.notFound('Table not found');

    // Drop it from memory so its timers stop and it is not served again.
    releaseTable(id);

    return { ok: true as const, data: { closed: true } };
  });

  // -------------------------------------------------------------- users

  app.get('/users', async (request) => {
    const query = request.query as { q?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 200);

    const term = query.q?.trim();
    const filter = term
      ? { displayName: { $regex: term, $options: 'i' } }
      : {};

    const docs = await users().find(filter).sort({ createdAt: -1 }).limit(limit).toArray();

    const stats = await playerStats()
      .find({ userId: { $in: docs.map((doc) => doc._id) } })
      .toArray();

    const handsByUser = new Map(
      stats.map((row) => [row.userId.toHexString(), row.handsPlayed]),
    );

    return {
      ok: true as const,
      data: {
        items: docs.map((doc) =>
          toManagedUser(doc, handsByUser.get(doc._id.toHexString()) ?? 0),
        ),
      },
    };
  });

  /**
   * Bans an account.
   *
   * Chips are deliberately untouched, so the ledger stays complete and
   * lifting the ban restores the account exactly as it was. Live sessions are
   * revoked, and if they are sitting at a table they are folded out of the
   * current hand and removed from their seat once it ends.
   */
  app.post('/users/:id/ban', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = banUserBodySchema.parse(request.body);

    if (!ObjectId.isValid(id)) throw AppError.notFound('Account not found');
    const userId = new ObjectId(id);

    if (userId.toHexString() === claim) {
      throw AppError.badRequest('You cannot ban yourself');
    }

    const target = await users().findOne({ _id: userId });
    if (!target) throw AppError.notFound('Account not found');

    // A moderator must not be able to ban an admin out from under them.
    if (target.role === 'admin' && request.claims?.role !== 'admin') {
      throw AppError.forbidden('Only an admin can ban an admin');
    }

    const expiresAt = body.durationHours
      ? new Date(Date.now() + body.durationHours * 3_600_000)
      : null;

    await users().updateOne(
      { _id: userId },
      {
        $set: {
          ban: {
            reason: body.reason,
            bannedAt: new Date(),
            bannedBy: new ObjectId(claim),
            expiresAt,
          },
          updatedAt: new Date(),
        },
      },
    );

    // Kill every live session, or the access token they already hold keeps
    // working until it expires.
    await revokeAllForUser(userId);

    // Fold them out of any hand they are in. Their committed chips stay in
    // the pot; the seat is vacated when the hand ends.
    const seated = await pokerTables()
      .find({ 'seats.userId': userId, status: { $ne: 'closed' } })
      .toArray();

    for (const doc of seated) {
      peekTable(doc._id.toHexString())?.banSeatedPlayer(id);
    }

    return {
      ok: true as const,
      data: { banned: true, expiresAt: expiresAt?.toISOString() ?? null },
    };
  });

  app.delete('/users/:id/ban', async (request) => {
    const { id } = request.params as { id: string };
    if (!ObjectId.isValid(id)) throw AppError.notFound('Account not found');

    const result = await users().updateOne(
      { _id: new ObjectId(id) },
      { $set: { ban: null, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) throw AppError.notFound('Account not found');

    return { ok: true as const, data: { banned: false } };
  });

  /** Appointing moderators is an admin-only power. */
  app.put('/users/:id/role', { onRequest: [app.requireRole('admin')] }, async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = setRoleBodySchema.parse(request.body);

    if (!ObjectId.isValid(id)) throw AppError.notFound('Account not found');
    if (id === claim) throw AppError.badRequest('You cannot change your own role');

    const result = await users().updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: body.role, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) throw AppError.notFound('Account not found');

    // The role lives in the JWT, so the old token would keep the old powers
    // until it expired. Force a fresh sign-in.
    await revokeAllForUser(new ObjectId(id));

    return { ok: true as const, data: { role: body.role } };
  });
}

/** Short, unambiguous join code. No 0/O or 1/I to avoid misreads. */
function makeJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}
