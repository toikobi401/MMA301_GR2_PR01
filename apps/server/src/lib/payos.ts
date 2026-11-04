import { PayOS } from '@payos/node';
import { config } from '../config.js';

/**
 * payOS issues a payment channel (kênh thu) and a payout channel (kênh chi)
 * with separate keys, so there are two clients. Either can be missing: the
 * wallet then falls back to its simulated endpoint for that direction.
 */

let paymentClient: PayOS | null | undefined;
let payoutClient: PayOS | null | undefined;

function build(
  clientId: string | undefined,
  apiKey: string | undefined,
  checksumKey: string | undefined,
): PayOS | null {
  if (!clientId || !apiKey || !checksumKey) return null;
  // Keys are passed explicitly: the SDK would otherwise read PAYOS_* from the
  // environment, and the payout client would pick up the payment keys.
  return new PayOS({ clientId, apiKey, checksumKey, timeout: 20_000, logLevel: 'warn' });
}

/** Client for payment links and webhooks, or null when not configured. */
export function payosPayments(): PayOS | null {
  if (paymentClient === undefined) {
    paymentClient = build(
      config.PAYOS_CLIENT_ID,
      config.PAYOS_API_KEY,
      config.PAYOS_CHECKSUM_KEY,
    );
  }
  return paymentClient;
}

/** Client for payouts, or null when not configured. */
export function payosPayouts(): PayOS | null {
  if (payoutClient === undefined) {
    payoutClient = build(
      config.PAYOS_PAYOUT_CLIENT_ID,
      config.PAYOS_PAYOUT_API_KEY,
      config.PAYOS_PAYOUT_CHECKSUM_KEY,
    );
  }
  return payoutClient;
}

export const payosDepositsEnabled = (): boolean => payosPayments() !== null;
export const payosWithdrawalsEnabled = (): boolean => payosPayouts() !== null;

export function chipsToVnd(chips: number): number {
  return chips * config.PAYOS_VND_PER_CHIP;
}
