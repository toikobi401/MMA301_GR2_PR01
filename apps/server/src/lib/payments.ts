import { randomInt } from 'node:crypto';
import { APIError, type Payout } from '@payos/node';
import { ObjectId, type ClientSession } from 'mongodb';
import { ErrorCode, type Payment } from '@app/shared';
import { config } from '../config.js';
import { applyChipChange } from '../routes/wallet.js';
import { isDuplicateKeyError, mongo, payments, users, type PaymentDoc } from './db.js';
import { AppError } from './errors.js';
import { chipsToVnd, payosPayments, payosPayouts } from './payos.js';

/** A payment link that nobody pays stops working after this long. */
const DEPOSIT_TTL_SECONDS = 15 * 60;

/**
 * A payout that payOS has no record of after this long was never created,
 * so its chips can safely go back. Before then a lookup may simply be early.
 */
const UNKNOWN_PAYOUT_REFUND_AFTER_MS = 10 * 60 * 1000;

/**
 * Schemes payOS may send the browser back to: the web client, the installed
 * app, and Expo Go during development.
 */
const RETURN_PROTOCOLS = new Set(['http:', 'https:', 'mma301gr2:', 'exp:', 'exps:']);

// ------------------------------------------------------------------ helpers

export function toPayment(doc: PaymentDoc): Payment {
  return {
    orderCode: doc.orderCode,
    kind: doc.kind,
    status: doc.status,
    chips: doc.chips,
    amountVnd: doc.amountVnd,
    checkoutUrl: doc.status === 'pending' ? doc.checkoutUrl : null,
    bankBin: doc.bankBin,
    accountNumber: doc.accountNumber ? `••••${doc.accountNumber.slice(-4)}` : null,
    failureReason: doc.failureReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * payOS wants a positive integer below 2^53. Milliseconds times a thousand
 * plus a random suffix stays under that until the year 2255, and the unique
 * index catches the rare collision.
 */
function newOrderCode(): number {
  return Date.now() * 1000 + randomInt(1000);
}

const payoutReference = (orderCode: number) => `RUT${orderCode}`;

async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongo.startSession();
  try {
    return await session.withTransaction(fn);
  } finally {
    await session.endSession();
  }
}

async function balanceOf(userId: ObjectId): Promise<number> {
  const user = await users().findOne({ _id: userId }, { projection: { chips: 1 } });
  return user?.chips ?? 0;
}

function providerError(message: string): AppError {
  return new AppError(502, ErrorCode.Internal, message);
}

function describe(error: unknown): string {
  if (error instanceof APIError) return error.desc ?? error.message;
  return error instanceof Error ? error.message : 'Unknown payOS error';
}

/**
 * True only when payOS definitely did not act on the request: it answered,
 * and the answer was a refusal. A timeout or a dropped connection is not
 * proof of anything — the payout may have gone through.
 */
function definitelyRejected(error: unknown): boolean {
  return error instanceof APIError && typeof error.status === 'number' && error.status < 500;
}

function resolveReturnUrl(requested: string | undefined): string {
  const fallback = `${config.PUBLIC_URL.replace(/\/+$/, '')}/api/v1/payments/payos/return`;
  if (!requested) return fallback;

  let url: URL;
  try {
    url = new URL(requested);
  } catch {
    throw AppError.badRequest('returnUrl is not a valid URL');
  }
  if (!RETURN_PROTOCOLS.has(url.protocol)) {
    throw AppError.badRequest('returnUrl uses a scheme the app does not own');
  }
  return url.toString();
}

// ----------------------------------------------------------------- deposits

export async function createDeposit(
  userId: ObjectId,
  chips: number,
  requestedReturnUrl: string | undefined,
): Promise<{ payment: Payment; checkoutUrl: string }> {
  const client = payosPayments();
  if (!client) throw AppError.forbidden('payOS deposits are not configured');

  const returnUrl = resolveReturnUrl(requestedReturnUrl);
  const amountVnd = chipsToVnd(chips);
  const now = new Date();

  // Insert first, so the order exists before payOS can call the webhook.
  let doc: PaymentDoc | null = null;
  for (let attempt = 0; attempt < 3 && !doc; attempt += 1) {
    const candidate: PaymentDoc = {
      _id: new ObjectId(),
      userId,
      kind: 'deposit',
      status: 'pending',
      orderCode: newOrderCode(),
      chips,
      amountVnd,
      paymentLinkId: null,
      checkoutUrl: null,
      payoutId: null,
      bankBin: null,
      accountNumber: null,
      providerReference: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      settledAt: null,
    };
    try {
      await payments().insertOne(candidate);
      doc = candidate;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  if (!doc) throw AppError.internal('Could not allocate an order code');

  try {
    const link = await client.paymentRequests.create({
      orderCode: doc.orderCode,
      amount: amountVnd,
      // payOS caps this at 25 characters for most banks.
      description: `NAP ${doc.orderCode}`.slice(0, 25),
      returnUrl,
      cancelUrl: returnUrl,
      expiredAt: Math.floor(now.getTime() / 1000) + DEPOSIT_TTL_SECONDS,
      items: [{ name: `${chips} chips`, quantity: 1, price: amountVnd }],
    });

    const updated = await payments().findOneAndUpdate(
      { _id: doc._id },
      {
        $set: {
          paymentLinkId: link.paymentLinkId,
          checkoutUrl: link.checkoutUrl,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );

    return { payment: toPayment(updated ?? doc), checkoutUrl: link.checkoutUrl };
  } catch (error) {
    await payments().updateOne(
      { _id: doc._id, status: 'pending' },
      { $set: { status: 'failed', failureReason: describe(error), updatedAt: new Date() } },
    );
    throw providerError(`payOS refused the payment link: ${describe(error)}`);
  }
}

/**
 * Credits a paid deposit exactly once.
 *
 * The status flip and the chip credit share one transaction, and the flip is
 * guarded on the status not already being `paid`, so the webhook and a status
 * check arriving together settle it once between them. A link marked
 * cancelled or expired here is still credited: if payOS says the money
 * arrived, it arrived.
 */
export async function settleDeposit(
  orderCode: number,
  amountPaid: number,
  providerReference: string | null,
): Promise<PaymentDoc | null> {
  return withTransaction(async (session) => {
    const doc = await payments().findOneAndUpdate(
      {
        orderCode,
        kind: 'deposit',
        status: { $in: ['pending', 'cancelled', 'expired', 'failed'] },
        amountVnd: { $lte: amountPaid },
      },
      {
        $set: {
          status: 'paid',
          providerReference,
          failureReason: null,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', session },
    );
    if (!doc) return null;

    await applyChipChange(doc.userId, 'deposit', doc.chips, `payos:${orderCode}`, session);
    return doc;
  });
}

async function closeDeposit(
  orderCode: number,
  status: 'cancelled' | 'expired' | 'failed',
  reason: string | null,
): Promise<void> {
  await payments().updateOne(
    { orderCode, kind: 'deposit', status: 'pending' },
    { $set: { status, failureReason: reason, updatedAt: new Date() } },
  );
}

async function syncDeposit(doc: PaymentDoc): Promise<void> {
  const client = payosPayments();
  if (!client || doc.status !== 'pending') return;

  const link = await client.paymentRequests.get(doc.orderCode);
  switch (link.status) {
    case 'PAID':
      await settleDeposit(doc.orderCode, link.amountPaid, link.transactions[0]?.reference ?? null);
      break;
    case 'CANCELLED':
      await closeDeposit(doc.orderCode, 'cancelled', link.cancellationReason);
      break;
    case 'EXPIRED':
      await closeDeposit(doc.orderCode, 'expired', null);
      break;
    case 'FAILED':
      await closeDeposit(doc.orderCode, 'failed', 'payOS reported the payment failed');
      break;
    default:
      // PENDING, PROCESSING, UNDERPAID: nothing to do until it changes.
      break;
  }
}

export async function cancelDeposit(userId: ObjectId, orderCode: number): Promise<void> {
  const client = payosPayments();
  if (!client) throw AppError.forbidden('payOS deposits are not configured');

  const doc = await payments().findOne({ orderCode, userId, kind: 'deposit' });
  if (!doc) throw AppError.notFound('Payment not found');
  if (doc.status !== 'pending') return;

  try {
    await client.paymentRequests.cancel(orderCode, 'Cancelled by the player');
  } catch (error) {
    // Already paid or already closed on payOS's side: the sync below finds out which.
    if (!definitelyRejected(error)) throw providerError(describe(error));
  }
  await syncDeposit(doc);
}

// -------------------------------------------------------------- withdrawals

/**
 * Debits the chips, then asks payOS to pay out.
 *
 * Debiting first is what makes it safe: the `$gte` guard in applyChipChange
 * rejects an overdraw atomically, and the payment row is written in the same
 * transaction, so chips never leave without a record of where they went.
 * payOS's idempotency key is the order code, so a retried request cannot pay
 * twice.
 */
export async function createWithdrawal(
  userId: ObjectId,
  chips: number,
  bankBin: string,
  accountNumber: string,
): Promise<{ payment: Payment; balance: number }> {
  const client = payosPayouts();
  if (!client) throw AppError.forbidden('payOS withdrawals are not configured');

  const amountVnd = chipsToVnd(chips);
  let doc: PaymentDoc | null = null;

  for (let attempt = 0; attempt < 3 && !doc; attempt += 1) {
    const now = new Date();
    const candidate: PaymentDoc = {
      _id: new ObjectId(),
      userId,
      kind: 'withdrawal',
      status: 'processing',
      orderCode: newOrderCode(),
      chips,
      amountVnd,
      paymentLinkId: null,
      checkoutUrl: null,
      payoutId: null,
      bankBin,
      accountNumber,
      providerReference: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      settledAt: null,
    };
    try {
      await withTransaction(async (session) => {
        await payments().insertOne(candidate, { session });
        await applyChipChange(
          userId,
          'withdrawal',
          -chips,
          `payos:${candidate.orderCode}`,
          session,
        );
      });
      doc = candidate;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  if (!doc) throw AppError.internal('Could not allocate an order code');

  try {
    const reference = payoutReference(doc.orderCode);
    const payout = await client.payouts.create(
      {
        referenceId: reference,
        amount: amountVnd,
        description: `RUT ${doc.orderCode}`.slice(0, 25),
        toBin: bankBin,
        toAccountNumber: accountNumber,
      },
      reference,
    );
    await applyPayout(doc, payout);
  } catch (error) {
    if (definitelyRejected(error)) {
      await refundWithdrawal(doc.orderCode, describe(error));
    }
    // Otherwise the outcome is unknown; leave it processing and let a status
    // check ask payOS later. Refunding now could pay the player twice.
  }

  const fresh = await payments().findOne({ _id: doc._id });
  return { payment: toPayment(fresh ?? doc), balance: await balanceOf(userId) };
}

/** Puts the chips back after a failed payout, once. */
async function refundWithdrawal(orderCode: number, reason: string): Promise<void> {
  await withTransaction(async (session) => {
    const doc = await payments().findOneAndUpdate(
      { orderCode, kind: 'withdrawal', status: 'processing' },
      {
        $set: {
          status: 'failed',
          failureReason: reason,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', session },
    );
    if (!doc) return;
    await applyChipChange(doc.userId, 'refund', doc.chips, `payos:${orderCode}`, session);
  });
}

async function applyPayout(doc: PaymentDoc, payout: Payout): Promise<void> {
  const transaction = payout.transactions[0];
  const state = transaction?.state;

  if (state === 'SUCCEEDED') {
    await payments().updateOne(
      { _id: doc._id, status: 'processing' },
      {
        $set: {
          status: 'succeeded',
          payoutId: payout.id,
          providerReference: transaction?.reference ?? null,
          settledAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return;
  }

  const failed =
    state === 'FAILED' ||
    state === 'CANCELLED' ||
    state === 'REVERSED' ||
    payout.approvalState === 'REJECTED' ||
    payout.approvalState === 'CANCELLED' ||
    payout.approvalState === 'FAILED';

  if (failed) {
    await payments().updateOne({ _id: doc._id }, { $set: { payoutId: payout.id } });
    await refundWithdrawal(
      doc.orderCode,
      transaction?.errorMessage ?? `payOS payout ${state ?? payout.approvalState}`,
    );
    return;
  }

  await payments().updateOne(
    { _id: doc._id, payoutId: null },
    { $set: { payoutId: payout.id, updatedAt: new Date() } },
  );
}

async function syncWithdrawal(doc: PaymentDoc): Promise<void> {
  const client = payosPayouts();
  if (!client || doc.status !== 'processing') return;

  let payout: Payout | undefined;
  if (doc.payoutId) {
    payout = await client.payouts.get(doc.payoutId);
  } else {
    const page = await client.payouts.list({ referenceId: payoutReference(doc.orderCode), limit: 1 });
    payout = page.data[0];
  }

  if (payout) {
    await applyPayout(doc, payout);
  } else if (Date.now() - doc.createdAt.getTime() > UNKNOWN_PAYOUT_REFUND_AFTER_MS) {
    await refundWithdrawal(doc.orderCode, 'payOS never received the payout');
  }
}

// ------------------------------------------------------------------- reads

/**
 * Returns the order, asking payOS first if it is still open. This is what
 * lets deposits settle on a LAN demo where payOS cannot reach the webhook.
 */
export async function getPayment(
  userId: ObjectId,
  orderCode: number,
): Promise<{ payment: Payment; balance: number }> {
  const doc = await payments().findOne({ orderCode, userId });
  if (!doc) throw AppError.notFound('Payment not found');

  try {
    if (doc.kind === 'deposit') await syncDeposit(doc);
    else await syncWithdrawal(doc);
  } catch {
    // payOS unreachable: report what we know rather than failing the read.
  }

  const fresh = (await payments().findOne({ _id: doc._id })) ?? doc;
  return { payment: toPayment(fresh), balance: await balanceOf(userId) };
}

export async function listPayments(userId: ObjectId, limit: number): Promise<Payment[]> {
  const docs = await payments().find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map(toPayment);
}
