import type { FastifyInstance } from 'fastify';
import {
  depositBodySchema,
  withdrawBodySchema,
  type ChipTransaction,
  type Wallet,
} from '@app/shared';
import { sql } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

interface TransactionRow {
  id: string;
  kind: ChipTransaction['kind'];
  amount: string;
  balance_after: string;
  reference: string | null;
  created_at: Date;
}

function toTransaction(row: TransactionRow): ChipTransaction {
  return {
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    reference: row.reference,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Applies a chip movement atomically.
 *
 * The balance update and the ledger row must land together — a crash between
 * them would leave a balance no transaction explains. `SELECT ... FOR UPDATE`
 * locks the row so two concurrent requests cannot both read the old balance
 * and each write their own total.
 */
async function applyChipChange(
  userId: string,
  kind: ChipTransaction['kind'],
  amount: number,
  reference: string | null,
): Promise<{ balance: number; transaction: ChipTransaction }> {
  return sql.begin(async (tx) => {
    const locked = await tx<Array<{ chips: string }>>`
      SELECT chips FROM users WHERE id = ${userId} FOR UPDATE
    `;

    const current = locked[0];
    if (!current) throw AppError.notFound('Account not found');

    const balance = Number(current.chips) + amount;
    if (balance < 0) {
      throw AppError.badRequest('Insufficient chips');
    }

    await tx`UPDATE users SET chips = ${balance} WHERE id = ${userId}`;

    const inserted = await tx<TransactionRow[]>`
      INSERT INTO chip_transactions (user_id, kind, amount, balance_after, reference)
      VALUES (${userId}, ${kind}, ${amount}, ${balance}, ${reference})
      RETURNING id, kind, amount, balance_after, reference, created_at
    `;

    const row = inserted[0];
    if (!row) throw AppError.internal('Failed to record the transaction');

    return { balance, transaction: toTransaction(row) };
  }) as Promise<{ balance: number; transaction: ChipTransaction }>;
}

export async function walletRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const [balanceRows, transactionRows] = await Promise.all([
      sql<Array<{ chips: string }>>`SELECT chips FROM users WHERE id = ${userId}`,
      sql<TransactionRow[]>`
        SELECT id, kind, amount, balance_after, reference, created_at
        FROM chip_transactions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ]);

    const balance = balanceRows[0];
    if (!balance) throw AppError.notFound('Account not found');

    const wallet: Wallet = {
      chips: Number(balance.chips),
      recentTransactions: transactionRows.map(toTransaction),
    };

    return { ok: true as const, data: wallet };
  });

  /**
   * Simulated deposit. No real money is involved anywhere in this system;
   * the endpoint credits play chips so the flow can be demonstrated.
   */
  app.post('/deposit', async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const body = depositBodySchema.parse(request.body);
    const result = await applyChipChange(userId, 'deposit', body.amount, 'simulated');

    return { ok: true as const, data: result };
  });

  app.post('/withdraw', async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const body = withdrawBodySchema.parse(request.body);
    const result = await applyChipChange(userId, 'withdrawal', -body.amount, 'simulated');

    return { ok: true as const, data: result };
  });

  app.get('/transactions', async (request) => {
    const userId = request.claims?.sub;
    if (!userId) throw AppError.unauthorized();

    const query = request.query as { limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 20) || 20, 100);
    const cursor = query.cursor ? new Date(query.cursor) : null;

    const rows = cursor
      ? await sql<TransactionRow[]>`
          SELECT id, kind, amount, balance_after, reference, created_at
          FROM chip_transactions
          WHERE user_id = ${userId} AND created_at < ${cursor}
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `
      : await sql<TransactionRow[]>`
          SELECT id, kind, amount, balance_after, reference, created_at
          FROM chip_transactions
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      ok: true as const,
      data: {
        items: page.map(toTransaction),
        nextCursor: hasMore && last ? last.created_at.toISOString() : null,
      },
    };
  });
}

export { applyChipChange };
