import type { Webhook } from '@payos/node';
import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  DEPOSIT_CHIPS_MAX,
  DEPOSIT_CHIPS_MIN,
  WITHDRAW_CHIPS_MAX,
  WITHDRAW_CHIPS_MIN,
  createDepositBodySchema,
  createWithdrawalBodySchema,
  type PaymentConfig,
} from '@app/shared';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import {
  cancelDeposit,
  createDeposit,
  createWithdrawal,
  getPayment,
  listPayments,
  settleDeposit,
} from '../lib/payments.js';
import { payosDepositsEnabled, payosPayments, payosWithdrawalsEnabled } from '../lib/payos.js';

function userIdOf(request: { claims?: { sub?: string } }): ObjectId {
  const claim = request.claims?.sub;
  if (!claim) throw AppError.unauthorized();
  return new ObjectId(claim);
}

function parseOrderCode(raw: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw AppError.badRequest('Invalid order code');
  return value;
}

export async function paymentRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------- from payOS
  //
  // Registered in their own scope, outside the auth hook: payOS calls the
  // webhook with no token, and the browser lands on the return page with none.

  await app.register(async (open) => {
    /**
     * payOS reports a payment here. The signature is the only thing that
     * makes the body trustworthy, so nothing is read before it verifies.
     */
    open.post('/payos/webhook', async (request) => {
      const client = payosPayments();
      if (!client) throw AppError.notFound('payOS is not configured');

      let data;
      try {
        data = await client.webhooks.verify(request.body as Webhook);
      } catch {
        request.log.warn('payOS webhook with a bad signature');
        throw AppError.badRequest('Invalid signature');
      }

      if (data.code === '00') {
        const settled = await settleDeposit(data.orderCode, data.amount, data.reference ?? null);
        request.log.info({ orderCode: data.orderCode, settled: Boolean(settled) }, 'payOS webhook');
      }

      // Always acknowledge a verified call, including payOS's test payload
      // with an order code we never issued, or payOS keeps retrying.
      return { ok: true as const, data: { received: true } };
    });

    /**
     * Fallback landing page when the client did not supply a return URL.
     * The wallet screen settles the order itself once the player is back.
     */
    open.get('/payos/return', async (request, reply) => {
      const query = request.query as { status?: string; cancel?: string };
      const cancelled = query.cancel === 'true' || query.status === 'CANCELLED';
      const message = cancelled
        ? 'Payment cancelled. You can close this page.'
        : 'Payment received. Return to the app — your chips appear once payOS confirms.';
      reply.type('text/html; charset=utf-8');
      return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment</title><body style="font-family:system-ui;padding:2rem;text-align:center"><p>${message}</p></body>`;
    });
  });

  // ------------------------------------------------------------- players

  await app.register(async (secured) => {
    secured.addHook('onRequest', secured.requireAuth);

    secured.get('/config', async () => {
      const data: PaymentConfig = {
        depositsEnabled: payosDepositsEnabled(),
        withdrawalsEnabled: payosWithdrawalsEnabled(),
        vndPerChip: config.PAYOS_VND_PER_CHIP,
        deposit: { min: DEPOSIT_CHIPS_MIN, max: DEPOSIT_CHIPS_MAX },
        withdraw: { min: WITHDRAW_CHIPS_MIN, max: WITHDRAW_CHIPS_MAX },
      };
      return { ok: true as const, data };
    });

    secured.get('/', async (request) => {
      const query = request.query as { limit?: string };
      const limit = Math.min(Number(query.limit ?? 10) || 10, 50);
      return { ok: true as const, data: { items: await listPayments(userIdOf(request), limit) } };
    });

    secured.post('/payos/deposits', async (request) => {
      const body = createDepositBodySchema.parse(request.body);
      const data = await createDeposit(userIdOf(request), body.chips, body.returnUrl);
      return { ok: true as const, data };
    });

    secured.post('/payos/deposits/:orderCode/cancel', async (request) => {
      const userId = userIdOf(request);
      const orderCode = parseOrderCode((request.params as { orderCode: string }).orderCode);
      await cancelDeposit(userId, orderCode);
      return { ok: true as const, data: await getPayment(userId, orderCode) };
    });

    secured.post('/payos/withdrawals', async (request) => {
      const body = createWithdrawalBodySchema.parse(request.body);
      const data = await createWithdrawal(
        userIdOf(request),
        body.chips,
        body.bankBin,
        body.accountNumber,
      );
      return { ok: true as const, data };
    });

    secured.get('/payos/:orderCode', async (request) => {
      const orderCode = parseOrderCode((request.params as { orderCode: string }).orderCode);
      return { ok: true as const, data: await getPayment(userIdOf(request), orderCode) };
    });
  });
}
