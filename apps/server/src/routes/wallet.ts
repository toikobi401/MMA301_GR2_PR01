import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  depositBodySchema,
  withdrawBodySchema,
  type ChipTransaction,
  type Wallet,
} from '@app/shared';
import {
  chipTransactions,
  users,
  type ChipTransactionDoc,
  type ChipTransactionKind,
} from '../lib/db.js';
import { AppError } from '../lib/errors.js';

function toTransaction(doc: ChipTransactionDoc): ChipTransaction {
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    amount: doc.amount,
    balanceAfter: doc.balanceAfter,
    reference: doc.reference,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Applies a chip movement.
 *
 * Read-then-write would be a race: two concurrent withdrawals could both read
 * the old balance and each write their own total, losing one of them. Instead
 * `findOneAndUpdate` does the check and the change in a single atomic
 * operation — the `$gte` guard means a debit that would overdraw simply
 * matches no document, so it fails rather than going negative.
 *
 * The returned balance is the real post-update value, so the ledger entry
 * always records what actually happened rather than what we predicted.
 */
async function applyChipChange(
  userId: ObjectId,
  kind: ChipTransactionKind,
  amount: number,
  reference: string | null,
): Promise<{ balance: number; transaction: ChipTransaction }> {
  const guard = amount < 0 ? { chips: { $gte: -amount } } : {};

  const updated = await users().findOneAndUpdate(
    { _id: userId, ...guard },
    { $inc: { chips: amount }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    // Either the account is gone or the guard rejected the debit. Tell them
    // apart so the error is accurate.
    const exists = await users().countDocuments({ _id: userId }, { limit: 1 });
    if (exists === 0) throw AppError.notFound('Account not found');
    throw AppError.badRequest('Insufficient chips');
  }

  const doc: ChipTransactionDoc = {
    _id: new ObjectId(),
    userId,
    kind,
    amount,
    balanceAfter: updated.chips,
    reference,
    createdAt: new Date(),
  };

  await chipTransactions().insertOne(doc);

  return { balance: updated.chips, transaction: toTransaction(doc) };
}

export async function walletRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const userId = new ObjectId(claim);

    const [user, recent] = await Promise.all([
      users().findOne({ _id: userId }, { projection: { chips: 1 } }),
      chipTransactions().find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);

    if (!user) throw AppError.notFound('Account not found');

    const wallet: Wallet = {
      chips: user.chips,
      recentTransactions: recent.map(toTransaction),
    };

    return { ok: true as const, data: wallet };
  });

  /**
   * Simulated deposit. No real money is involved anywhere in this system;
   * the endpoint credits play chips so the flow can be demonstrated.
   */
  app.post('/deposit', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const body = depositBodySchema.parse(request.body);
    const result = await applyChipChange(
      new ObjectId(claim),
      'deposit',
      body.amount,
      'simulated',
    );

    return { ok: true as const, data: result };
  });

  app.post('/withdraw', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const body = withdrawBodySchema.parse(request.body);
    const result = await applyChipChange(
      new ObjectId(claim),
      'withdrawal',
      -body.amount,
      'simulated',
    );

    return { ok: true as const, data: result };
  });

  app.get('/transactions', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const userId = new ObjectId(claim);

    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 20) || 20, 100);

    // Paginate on _id rather than createdAt: ObjectIds are monotonic and
    // unique, so two documents written in the same millisecond cannot make a
    // cursor skip or repeat a row.
    const filter = query.cursor
      ? { userId, _id: { $lt: new ObjectId(query.cursor) } }
      : { userId };

    const docs = await chipTransactions()
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
        items: page.map(toTransaction),
        nextCursor: hasMore && last ? last._id.toHexString() : null,
      },
    };
  });
}

export { applyChipChange };
