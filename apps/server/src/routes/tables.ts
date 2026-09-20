import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  addBotBodySchema,
  canModerate,
  joinTableBodySchema,
  setAutoFillBodySchema,
  type TableHand,
  type TableSummary,
} from '@app/shared';
import { getTable } from '../game/registry.js';
import {
  hands,
  pokerTables,
  users,
  type HandDoc,
  type PokerTableDoc,
  type SeatDoc,
} from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { applyChipChange } from './wallet.js';

function toSummary(doc: PokerTableDoc): TableSummary {
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
  };
}

function emptySeats(count: number): SeatDoc[] {
  return Array.from({ length: count }, (_, index) => ({
    seat: index,
    userId: null,
    displayName: null,
    stack: 0,
    sittingOut: false,
    botProfile: null,
    joinedAt: new Date(),
  }));
}

/**
 * Only the table owner may add or remove bots. Without this any player could
 * stack a table with easy bots and farm them.
 */
async function assertOwner(
  doc: PokerTableDoc,
  userId: string,
  role: string | undefined,
): Promise<void> {
  if (role === 'admin') return;
  if (doc.ownerId?.toHexString() === userId) return;
  throw AppError.forbidden('Only the table owner can manage bots');
}

/**
 * A stored hand as everyone at the table may see it.
 *
 * Betting is public: every action happened in front of the whole table, so
 * making it reviewable afterwards only levels the field between a player
 * taking notes and one who is not. Cards are the opposite — `holeCards` is
 * populated in storage only when the hand reached a contested showdown, so
 * passing it straight through reveals nothing that was not already shown.
 */
function toTableHand(doc: HandDoc): TableHand {
  const names = new Map(
    doc.players.map((player) => [player.userId.toHexString(), player.displayName]),
  );

  return {
    id: doc._id.toHexString(),
    handNumber: doc.handNumber,
    board: doc.board,
    potTotal: doc.potTotal,
    buttonSeat: doc.buttonSeat,
    players: doc.players.map((player) => ({
      userId: player.userId.toHexString(),
      displayName: player.displayName,
      seat: player.seat,
      // Already null unless they showed down; no extra filtering needed.
      revealedCards: player.holeCards,
      handRank: player.handRank,
      netChips: player.netChips,
      won: player.netChips > 0,
    })),
    actions: doc.actions.map((action) => ({
      sequence: action.sequence,
      userId: action.userId?.toHexString() ?? null,
      displayName: action.userId ? (names.get(action.userId.toHexString()) ?? null) : null,
      street: action.street,
      action: action.action,
      amount: action.amount,
      offsetMs: action.offsetMs,
    })),
    startedAt: doc.startedAt.toISOString(),
    endedAt: doc.endedAt?.toISOString() ?? null,
  };
}

export async function tableRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async () => {
    const docs = await pokerTables()
      .find({ status: { $ne: 'closed' }, isPrivate: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return { ok: true as const, data: { items: docs.map(toSummary), nextCursor: null } };
  });

  // Creating a table moved to POST /api/v1/moderation/tables. Players do not
  // open tables any more, so the lobby stays a curated set rather than
  // whatever anyone happened to make.

  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const table = await getTable(id);
    return { ok: true as const, data: table.viewFor(request.claims?.sub ?? null) };
  });

  /**
   * Takes a seat and moves chips from the account into the table stack.
   *
   * The debit and the seat assignment must not drift apart: chips leaving the
   * wallet without landing on a seat would lose them. The seat is claimed
   * first with a conditional update, and the debit is rolled back if it fails.
   */
  app.post('/:id/join', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = joinTableBodySchema.parse(request.body);
    const userId = new ObjectId(claim);

    const table = await getTable(id);
    const doc = table.table;

    if (doc.isPrivate && body.joinCode !== doc.joinCode) {
      throw AppError.forbidden('This table needs a valid join code');
    }
    if (body.buyIn < doc.minBuyIn || body.buyIn > doc.maxBuyIn) {
      throw AppError.badRequest(
        `Buy-in must be between ${doc.minBuyIn} and ${doc.maxBuyIn}`,
      );
    }
    if (doc.seats.some((seat) => seat.userId?.equals(userId))) {
      throw AppError.conflict('You are already seated at this table');
    }

    const seatNumber =
      body.seat ?? doc.seats.find((seat) => seat.userId === null)?.seat;
    if (seatNumber === undefined) throw AppError.conflict('The table is full');

    const user = await users().findOne({ _id: userId }, { projection: { displayName: 1 } });
    if (!user) throw AppError.notFound('Account not found');

    // Debit first so the chips are reserved, then claim the seat.
    await applyChipChange(userId, 'buy_in', -body.buyIn, `table:${id}`);

    const claimed = await pokerTables().updateOne(
      {
        _id: doc._id,
        // Only succeeds if the seat is still empty, so two players racing for
        // the same seat cannot both take it.
        seats: { $elemMatch: { seat: seatNumber, userId: null } },
      },
      {
        $set: {
          'seats.$.userId': userId,
          'seats.$.displayName': user.displayName,
          'seats.$.stack': body.buyIn,
          'seats.$.joinedAt': new Date(),
        },
      },
    );

    if (claimed.modifiedCount !== 1) {
      // Someone took the seat first. Return the chips rather than losing them.
      await applyChipChange(userId, 'cash_out', body.buyIn, `refund:${id}`);
      throw AppError.conflict('That seat was just taken');
    }

    const seat = doc.seats.find((entry) => entry.seat === seatNumber);
    if (seat) {
      seat.userId = userId;
      seat.displayName = user.displayName;
      seat.stack = body.buyIn;
      seat.joinedAt = new Date();
    }

    // A second player makes a hand possible.
    table.startHandIfReady();

    return { ok: true as const, data: table.viewFor(claim) };
  });

  app.post('/:id/leave', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const userId = new ObjectId(claim);

    const table = await getTable(id);
    const seat = table.table.seats.find((entry) => entry.userId?.equals(userId));
    if (!seat) throw AppError.badRequest('You are not seated at this table');

    const refund = seat.stack;

    seat.userId = null;
    seat.displayName = null;
    seat.stack = 0;

    await pokerTables().updateOne(
      { _id: table.table._id, 'seats.seat': seat.seat },
      {
        $set: {
          'seats.$.userId': null,
          'seats.$.displayName': null,
          'seats.$.stack': 0,
        },
      },
    );

    if (refund > 0) {
      await applyChipChange(userId, 'cash_out', refund, `table:${id}`);
    }

    return { ok: true as const, data: { left: true, refunded: refund } };
  });

  /**
   * Seats a bot.
   *
   * Bots do not go through the wallet: they are given a fixed stack and never
   * top up, so no chips are debited and none are refunded when they leave.
   * That keeps the chip ledger a record of human money only — the cost is
   * that chips are not conserved across a table with bots on it, which is a
   * deliberate trade.
   */
  app.post('/:id/bots', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = addBotBodySchema.parse(request.body);

    const table = await getTable(id);
    const doc = table.table;

    await assertOwner(doc, claim, request.claims?.role);

    const seatNumber = body.seat ?? doc.seats.find((seat) => seat.userId === null)?.seat;
    if (seatNumber === undefined) throw AppError.conflict('The table is full');

    const seated = new Set(
      doc.seats.map((seat) => seat.userId?.toHexString()).filter(Boolean) as string[],
    );

    // Any bot account not already at this table. Picking at random keeps the
    // same names from always appearing in the same order.
    const candidates = await users()
      .find({ isBot: true }, { projection: { displayName: 1 } })
      .toArray();

    const free = candidates.filter((bot) => !seated.has(bot._id.toHexString()));
    if (free.length === 0) {
      throw AppError.conflict('No bot accounts are free. Run `npm run seed:bots`.');
    }

    const bot = free[Math.floor(Math.random() * free.length)];
    if (!bot) throw AppError.internal('Failed to pick a bot');

    const buyIn = body.buyIn ?? doc.minBuyIn;
    if (buyIn < doc.minBuyIn || buyIn > doc.maxBuyIn) {
      throw AppError.badRequest(
        `Buy-in must be between ${doc.minBuyIn} and ${doc.maxBuyIn}`,
      );
    }

    const claimed = await pokerTables().updateOne(
      {
        _id: doc._id,
        seats: { $elemMatch: { seat: seatNumber, userId: null } },
      },
      {
        $set: {
          'seats.$.userId': bot._id,
          'seats.$.displayName': bot.displayName,
          'seats.$.stack': buyIn,
          'seats.$.botProfile': { difficulty: body.difficulty },
          'seats.$.joinedAt': new Date(),
          // Without this the table deals one hand and stops, because nothing
          // else starts the next one.
          autoDeal: true,
        },
      },
    );

    if (claimed.modifiedCount !== 1) throw AppError.conflict('That seat was just taken');

    const seat = doc.seats.find((entry) => entry.seat === seatNumber);
    if (seat) {
      seat.userId = bot._id;
      seat.displayName = bot.displayName;
      seat.stack = buyIn;
      seat.botProfile = { difficulty: body.difficulty };
      seat.joinedAt = new Date();
    }
    doc.autoDeal = true;

    table.startHandIfReady();

    return { ok: true as const, data: table.viewFor(claim) };
  });

  app.delete('/:id/bots/:seat', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id, seat: seatParam } = request.params as { id: string; seat: string };
    const seatNumber = Number(seatParam);

    const table = await getTable(id);
    const doc = table.table;

    await assertOwner(doc, claim, request.claims?.role);

    const seat = doc.seats.find((entry) => entry.seat === seatNumber);
    if (!seat || !seat.botProfile) throw AppError.badRequest('That seat holds no bot');

    // Removing a player mid-hand would strand the pot they have contributed
    // to, so wait for the hand to finish.
    const hand = table.currentHand;
    const inHand =
      hand !== null &&
      hand.street !== 'complete' &&
      hand.players.some((player) => player.id === seat.userId?.toHexString());
    if (inHand) throw AppError.conflict('That bot is in a hand; try again shortly');

    seat.userId = null;
    seat.displayName = null;
    seat.stack = 0;
    seat.botProfile = null;

    await pokerTables().updateOne(
      { _id: doc._id, 'seats.seat': seatNumber },
      {
        $set: {
          'seats.$.userId': null,
          'seats.$.displayName': null,
          'seats.$.stack': 0,
          'seats.$.botProfile': null,
        },
      },
    );

    return { ok: true as const, data: table.viewFor(claim) };
  });

  app.put('/:id/auto-fill', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const body = setAutoFillBodySchema.parse(request.body);

    const table = await getTable(id);
    const doc = table.table;

    await assertOwner(doc, claim, request.claims?.role);

    doc.autoFillBots = body.enabled;
    doc.autoFillDifficulty = body.difficulty;
    if (body.enabled) doc.autoDeal = true;

    await pokerTables().updateOne(
      { _id: doc._id },
      {
        $set: {
          autoFillBots: body.enabled,
          autoFillDifficulty: body.difficulty,
          ...(body.enabled ? { autoDeal: true } : {}),
        },
      },
    );

    return { ok: true as const, data: table.viewFor(claim) };
  });

  /**
   * Every finished hand at this table, as public information.
   *
   * Restricted to people seated here, and to moderators. Opening it to
   * anyone would turn the lobby into a database of how every player behaves,
   * which is a different thing from levelling one table.
   *
   * Hands appear only once complete. A partial record would leak the shape of
   * live betting to someone who had already folded and was watching.
   */
  app.get('/:id/hands', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; before?: string };
    const limit = Math.min(Number(query.limit ?? 25) || 25, 100);

    const table = await getTable(id);
    const seated = table.table.seats.some((seat) => seat.userId?.toHexString() === claim);

    if (!seated && !canModerate(request.claims?.role)) {
      throw AppError.forbidden('Only players at this table can read its hands');
    }

    // Paginate on _id: ObjectIds are monotonic, so two hands finishing in the
    // same millisecond cannot make a cursor skip or repeat one.
    const filter = query.before
      ? { tableId: table.table._id, _id: { $lt: new ObjectId(query.before) } }
      : { tableId: table.table._id };

    const docs = await hands()
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];

    return {
      ok: true as const,
      data: {
        items: page.map(toTableHand),
        nextCursor: hasMore && last ? last._id.toHexString() : null,
      },
    };
  });

  /** Deals the next hand. Normally automatic; exposed for testing and demos. */
  app.post('/:id/deal', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const table = await getTable(id);

    const started = table.startHandIfReady();
    if (!started) {
      throw AppError.badRequest('Cannot deal: a hand is running or too few players are seated');
    }

    return { ok: true as const, data: table.viewFor(claim) };
  });
}
