import { z } from 'zod';

/**
 * Chip top-ups and cash-outs through payOS.
 *
 * A deposit is a payOS payment link: chips are credited only once payOS
 * reports the order paid (webhook or a status check), never when the client
 * says it came back from checkout. A withdrawal debits the chips first, then
 * asks payOS to pay out; if the payout fails the chips are refunded.
 */

export const paymentKindSchema = z.enum(['deposit', 'withdrawal']);
export type PaymentKind = z.infer<typeof paymentKindSchema>;

/**
 * deposit:    pending → paid | cancelled | expired
 * withdrawal: processing → succeeded | failed (chips refunded)
 */
export const paymentStatusSchema = z.enum([
  'pending',
  'paid',
  'cancelled',
  'expired',
  'processing',
  'succeeded',
  'failed',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  orderCode: z.number().int().positive(),
  kind: paymentKindSchema,
  status: paymentStatusSchema,
  chips: z.number().int().positive(),
  amountVnd: z.number().int().positive(),
  /** Deposit only, while the link can still be paid. */
  checkoutUrl: z.string().nullable(),
  /** Withdrawal only. */
  bankBin: z.string().nullable(),
  /** Withdrawal only, masked to the last four digits. */
  accountNumber: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const DEPOSIT_CHIPS_MIN = 100;
export const DEPOSIT_CHIPS_MAX = 100_000;
export const WITHDRAW_CHIPS_MIN = 100;
export const WITHDRAW_CHIPS_MAX = 1_000_000;

export const paymentConfigSchema = z.object({
  /** payOS payment links are configured; deposits go through checkout. */
  depositsEnabled: z.boolean(),
  /** payOS payouts are configured; withdrawals go to a bank account. */
  withdrawalsEnabled: z.boolean(),
  vndPerChip: z.number().int().positive(),
  deposit: z.object({ min: z.number().int(), max: z.number().int() }),
  withdraw: z.object({ min: z.number().int(), max: z.number().int() }),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

export const createDepositBodySchema = z.object({
  chips: z.number().int().min(DEPOSIT_CHIPS_MIN).max(DEPOSIT_CHIPS_MAX),
  /**
   * Where payOS sends the browser afterwards: the app's deep link on device,
   * the wallet route on web. The server checks the scheme.
   */
  returnUrl: z.string().max(512).optional(),
});
export type CreateDepositBody = z.infer<typeof createDepositBodySchema>;

export const createDepositResultSchema = z.object({
  payment: paymentSchema,
  checkoutUrl: z.string(),
});
export type CreateDepositResult = z.infer<typeof createDepositResultSchema>;

export const createWithdrawalBodySchema = z.object({
  chips: z.number().int().min(WITHDRAW_CHIPS_MIN).max(WITHDRAW_CHIPS_MAX),
  /** Six-digit NAPAS bank BIN, e.g. 970436 for Vietcombank. */
  bankBin: z.string().regex(/^\d{6}$/, 'Bank BIN is six digits'),
  accountNumber: z.string().regex(/^\d{6,19}$/, 'Account number is 6–19 digits'),
});
export type CreateWithdrawalBody = z.infer<typeof createWithdrawalBodySchema>;

export const paymentResultSchema = z.object({
  payment: paymentSchema,
  /** The wallet balance after this call, so the screen need not refetch. */
  balance: z.number().int().nonnegative(),
});
export type PaymentResult = z.infer<typeof paymentResultSchema>;
