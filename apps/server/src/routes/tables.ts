import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { randomInt } from 'node:crypto';
import {
  addBotBodySchema,
  addChipsBodySchema,
  canModerate,
  createTableBodySchema,
  joinTableBodySchema,
  setAutoFillBodySchema,
  setAutoRebuyBodySchema,
  setSittingOutBodySchema,
  type ChatMessage,
  type LeaveTableResult,
  type TableHand,
  type TableSummary,
  type UserRole,
} from '@app/shared';
import { getTable, peekTable } from '../game/registry.js';
import {
  chatMessages,
  hands,
  isDuplicateKeyError,
  pokerTables,
  users,
  type HandDoc,
  type PokerTableDoc,
  type SeatDoc,
} from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { applyChipChange } from './wallet.js';

function toSummary(doc: PokerTableDoc, viewerId: string): TableSummary {
  const viewerIsOwner = doc.ownerId?.toHexString() === viewerId;

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
    freeSeats: doc.seats.filter((seat) => seat.userId === null).map((seat) => seat.seat),
    viewerSeated: doc.seats.some((seat) => seat.userId?.toHexString() === viewerId),
    // A table not in memory has seen no departures since the server started.
    viewerMinBuyIn: peekTable(doc._id.toHexString())?.minBuyInFor(viewerId) ?? doc.minBuyIn,
    joinCode: viewerIsOwner ? doc.joinCode : null,
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

/** No lookalikes, so a code read aloud across a room survives. */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  return Array.from(
    { length: 6 },
    () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)],
  ).join('');
}

/**
 * A private table is for people who were given its code.
 *
 * The id alone must not be enough to watch one: ids appear in URLs, which get
 * pasted around, and the betting is nobody else's business.
 */
export function assertCanViewTable(
  doc: PokerTableDoc,
  userId: string,
  role: UserRole | undefined,
): void {
  if (!doc.isPrivate || canModerate(role)) return;
  if (doc.ownerId?.toHexString() === userId) return;
  if (doc.seats.some((seat) => seat.userId?.toHexString() === userId)) return;
  throw AppError.forbidden('This table is private');
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

  app.post('/', async (request, reply) => {
    const ownerId = request.claims?.sub;
    if (!ownerId || !canModerate(request.claims?.role)) {
      throw AppError.forbidden('Only moderators can open tables');
    }

    const body = createTableBodySchema.parse(request.body);
    const now = new Date();
    const doc: PokerTableDoc = {
      _id: new ObjectId(),
      name: body.name,
      ownerId: new ObjectId(ownerId),
      maxSeats: body.maxSeats,
      smallBlind: body.smallBlind,
      bigBlind: body.bigBlind,
      minBuyIn: body.minBuyIn,
      maxBuyIn: body.maxBuyIn,
      isPrivate: body.isPrivate,
      joinCode: body.isPrivate ? generateJoinCode() : null,
      status: 'open',
      seats: emptySeats(body.maxSeats),
      handNumber: 0,
      buttonSeat: 0,
      autoFillBots: false,
      autoFillDifficulty: 'medium',
      createdAt: now,
    };

    // The unique index decides: checking first would leave a race window.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await pokerTables().insertOne(doc);
        break;
      } catch (error) {
        if (!body.isPrivate || !isDuplicateKeyError(error) || attempt >= 4) throw error;
        doc.joinCode = generateJoinCode();
      }
    }

    reply.status(201);
    return { ok: true as const, data: toSummary(doc, ownerId) };
  });

  app.get('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const docs = await pokerTables()
      .find({
        status: { $ne: 'closed' },
        // Private tables stay hidden, except from the people already in them.
        $or: [{ isPrivate: false }, { ownerId: viewer }, { 'seats.userId': viewer }],
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return {
      ok: true as const,
      data: { items: docs.map((doc) => toSummary(doc, claim)), nextCursor: null },
    };
  });

  /** Finds a private table from the code its owner passed around. */
  app.get('/code/:code', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { code } = request.params as { code: string };
    const doc = await pokerTables().findOne({
      joinCode: code.trim().toUpperCase(),
      status: { $ne: 'closed' },
    });
    if (!doc) throw AppError.notFound('No table has that code');

    return { ok: true as const, data: toSummary(doc, claim) };
  });

  app.get('/:id', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const table = await getTable(id);
    assertCanViewTable(table.table, claim, request.claims?.role);
    return { ok: true as const, data: table.viewFor(claim) };
  });

  /** Recent messages, so opening or reloading a table does not lose the talk. */
  app.get('/:id/chat', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const table = await getTable(id);
    assertCanViewTable(table.table, claim, request.claims?.role);

    const docs = await chatMessages()
      .find({ tableId: table.table._id })
      .sort({ _id: -1 })
      .limit(50)
      .toArray();

    const items: ChatMessage[] = docs.reverse().map((doc) => ({
      id: doc._id.toHexString(),
      tableId: id,
      userId: doc.userId?.toHexString() ?? null,
      displayName: doc.displayName,
      body: doc.body,
      createdAt: doc.createdAt.toISOString(),
    }));

    return { ok: true as const, data: { items } };
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

    if (doc.isPrivate && body.joinCode?.trim().toUpperCase() !== doc.joinCode) {
      throw AppError.forbidden('This table needs a valid join code');
    }
    const minBuyIn = table.minBuyInFor(claim);
    if (body.buyIn < minBuyIn || body.buyIn > doc.maxBuyIn) {
      throw AppError.badRequest(
        minBuyIn > doc.minBuyIn
          ? `You left this table recently, so you must return with at least ${minBuyIn}`
          : `Buy-in must be between ${doc.minBuyIn} and ${doc.maxBuyIn}`,
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
          'seats.$.sittingOut': false,
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
      seat.sittingOut = false;
      seat.joinedAt = new Date();
    }

    table.seatTaken(claim);
    table.seatChanged();

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
    const seatNumber = seat.seat;

    const refund = table.leave(claim);

    if (refund === null) {
      // Folded out of the running hand; the table pays them when it ends.
      const result: LeaveTableResult = { left: true, refunded: 0, pending: true };
      return { ok: true as const, data: result };
    }

    await pokerTables().updateOne(
      { _id: table.table._id, 'seats.seat': seatNumber },
      {
        $set: {
          'seats.$.userId': null,
          'seats.$.displayName': null,
          'seats.$.stack': 0,
          'seats.$.sittingOut': false,
        },
      },
    );

    if (refund > 0) {
      await applyChipChange(userId, 'cash_out', refund, `table:${id}`);
    }

    const result: LeaveTableResult = { left: true, refunded: refund, pending: false };
    return { ok: true as const, data: result };
  });

  /**
   * Adds chips to a seat between hands, up to the table maximum.
   *
   * A seat mid-hand holds its starting stack, so nobody in a hand can get
   * through here. The debit comes first, and the guard on the update means two
   * racing requests cannot both apply to the same stack.
   */
  app.post('/:id/add-chips', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const { amount } = addChipsBodySchema.parse(request.body);
    const userId = new ObjectId(claim);

    const table = await getTable(id);
    const doc = table.table;

    const seat = doc.seats.find((entry) => entry.userId?.equals(userId));
    if (!seat) throw AppError.badRequest('You are not seated at this table');
    if (table.isInCurrentHand(claim)) {
      throw AppError.conflict('Chips can be added once this hand ends');
    }

    const before = seat.stack;
    const after = before + amount;
    if (after > doc.maxBuyIn) {
      throw AppError.badRequest(`This table allows at most ${doc.maxBuyIn} on the seat`);
    }
    if (after < doc.minBuyIn) {
      throw AppError.badRequest(`You need at least ${doc.minBuyIn} on the seat`);
    }

    await applyChipChange(userId, 'buy_in', -amount, `table:${id}`);

    const claimed = await pokerTables().updateOne(
      { _id: doc._id, seats: { $elemMatch: { seat: seat.seat, userId, stack: before } } },
      { $set: { 'seats.$.stack': after } },
    );

    if (claimed.modifiedCount !== 1) {
      await applyChipChange(userId, 'cash_out', amount, `refund:${id}`);
      throw AppError.conflict('Could not add chips; try again');
    }

    seat.stack = after;
    table.seatChanged();

    return { ok: true as const, data: table.viewFor(claim) };
  });

  app.put('/:id/sitting-out', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const { sittingOut } = setSittingOutBodySchema.parse(request.body);
    const userId = new ObjectId(claim);

    const table = await getTable(id);
    table.setSittingOut(claim, sittingOut);

    await pokerTables().updateOne(
      { _id: table.table._id, 'seats.userId': userId },
      { $set: { 'seats.$.sittingOut': sittingOut } },
    );

    return { ok: true as const, data: table.viewFor(claim) };
  });

  app.put('/:id/auto-rebuy', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const { id } = request.params as { id: string };
    const { enabled } = setAutoRebuyBodySchema.parse(request.body);

    const table = await getTable(id);
    if (!table.table.seats.some((seat) => seat.userId?.toHexString() === claim)) {
      throw AppError.badRequest('You are not seated at this table');
    }
    table.setAutoRebuy(claim, enabled);

    return { ok: true as const, data: table.viewFor(claim) };
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

    table.seatChanged();

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

    table.seatChanged();

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

    await pokerTables().updateOne(
      { _id: doc._id },
      {
        $set: {
          autoFillBots: body.enabled,
          autoFillDifficulty: body.difficulty,
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

  /** Deals the next hand. Normally automatic; exposed for testing and demos. */}
