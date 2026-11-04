import { ObjectId } from 'mongodb';
import type { DeleteTableResult } from '@app/shared';
import { chipTransactions, mongo, pokerTables, users } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { cancelPendingTurn } from './bot-driver.js';
import { getTable, notifyTableDeleted, peekTable, releaseTable } from './registry.js';

/** Called under the REST table mutation lock. Failed transactions leave the table frozen for retry. */
export async function deleteTable(tableId: string): Promise<DeleteTableResult> {
  tableId = tableId.toLowerCase();
  const table = peekTable(tableId) ?? await getTable(tableId);
  cancelPendingTurn(tableId);
  await table.prepareDeletion();

  const session = mongo.startSession();
  try {
    await session.withTransaction(async () => {
      const removed = await pokerTables().findOneAndDelete({ _id: table.table._id }, { session });
      if (!removed) throw AppError.notFound('Table not found');

      for (const seat of table.table.seats) {
        if (!seat.userId || seat.botProfile || seat.stack <= 0) continue;
        const user = await users().findOne({ _id: seat.userId }, { session, projection: { isBot: 1 } });
        if (!user) throw AppError.conflict('Seated account not found; table was not deleted');
        if (user.isBot) continue;

        const now = new Date();
        const updated = await users().findOneAndUpdate(
          { _id: seat.userId },
          { $inc: { chips: seat.stack }, $set: { updatedAt: now } },
          { session, returnDocument: 'after' },
        );
        if (!updated) throw AppError.notFound('Seated account not found');
        await chipTransactions().insertOne({
          _id: new ObjectId(), userId: seat.userId, kind: 'cash_out',
          amount: seat.stack, balanceAfter: updated.chips,
          reference: `table:${tableId}`, createdAt: now,
        }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  notifyTableDeleted(tableId);
  releaseTable(tableId);
  return { deleted: true, tableId };
}
