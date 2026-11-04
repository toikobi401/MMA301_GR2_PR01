import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { HandDetail, HandSummary } from '@app/shared';
import { hands, pokerTables, type HandDoc } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

function toSummary(doc: HandDoc, viewer: ObjectId, tableName: string): HandSummary {
  return {
    id: doc._id.toHexString(),
    tableId: doc.tableId.toHexString(),
    tableName,
    handNumber: doc.handNumber,
    board: doc.board,
    potTotal: doc.potTotal,
    netChips: doc.players.find((player) => player.userId.equals(viewer))?.netChips ?? 0,
    startedAt: doc.startedAt.toISOString(),
  };
}

async function tableNames(ids: ObjectId[]): Promise<Map<string, string>> {
  const docs = await pokerTables()
    .find({ _id: { $in: ids } }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc.name]));
}

/**
 * A player's own hands, for the history screen and its replay.
 *
 * Restricted to hands they were dealt into. Other players' cards are already
 * null in storage unless they were shown, so returning them reveals nothing.
 */
export async function handRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const query = request.query as { limit?: string; before?: string };
    const limit = Math.min(Number(query.limit ?? 25) || 25, 100);
    if (query.before && !ObjectId.isValid(query.before)) {
      throw AppError.badRequest('Invalid cursor');
    }

    // Paginate on _id: ObjectIds are monotonic, so two hands finishing in the
    // same millisecond cannot make a cursor skip or repeat one.
    const docs = await hands()
      .find({
        'players.userId': viewer,
        ...(query.before ? { _id: { $lt: new ObjectId(query.before) } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const names = await tableNames(page.map((doc) => doc.tableId));
    const last = page[page.length - 1];

    return {
      ok: true as const,
      data: {
        items: page.map((doc) =>
          toSummary(doc, viewer, names.get(doc.tableId.toHexString()) ?? 'Closed table'),
        ),
        nextCursor: hasMore && last ? last._id.toHexString() : null,
      },
    };
  });

  app.get('/:id', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const { id } = request.params as { id: string };
    if (!ObjectId.isValid(id)) throw AppError.notFound('Hand not found');

    // Same answer for "does not exist" and "not yours", so ids cannot be probed.
    const doc = await hands().findOne({ _id: new ObjectId(id), 'players.userId': viewer });
    if (!doc) throw AppError.notFound('Hand not found');

    const names = await tableNames([doc.tableId]);
    const playerNames = new Map(
      doc.players.map((player) => [player.userId.toHexString(), player.displayName]),
    );

    const detail: HandDetail = {
      ...toSummary(doc, viewer, names.get(doc.tableId.toHexString()) ?? 'Closed table'),
      players: doc.players.map((player) => ({
        userId: player.userId.toHexString(),
        displayName: player.displayName,
        seat: player.seat,
        holeCards: player.holeCards,
        startingStack: player.startingStack,
        netChips: player.netChips,
        handRank: player.handRank,
      })),
      actions: doc.actions.map((action) => ({
        sequence: action.sequence,
        userId: action.userId?.toHexString() ?? null,
        displayName: action.userId ? (playerNames.get(action.userId.toHexString()) ?? null) : null,
        street: action.street,
        action: action.action,
        amount: action.amount,
        offsetMs: action.offsetMs,
      })),
    };

    return { ok: true as const, data: detail };
  });
}
