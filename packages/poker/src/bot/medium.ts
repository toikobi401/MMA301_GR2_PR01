import { ActionType, Street } from '../types';
import {
  betSize,
  can,
  passiveDecision,
  postflopStrength,
  potOdds,
  preflopStrength,
  raiseOption,
} from './strength';
import type { BotPolicy } from './types';

/**
 * Thresholds, calibrated against the scale each street actually produces.
 *
 * Preflop uses Chen, where a premium hand scores around 0.7. Postflop uses
 * category/8, where top pair is about 0.22, two pair 0.35, trips 0.48, and a
 * flush 0.73 — a very different range. Writing one set of thresholds for both
 * made the bot check top pair and two pair every time, which lost to a bot
 * that bets at random.
 */
const THRESHOLDS: Record<string, { call: number; raise: number }> = {
  // Chen scale: raise with roughly the top 10 percent of hands.
  [Street.Preflop]: { call: 0.45, raise: 0.6 },
  // Category scale: bet top pair or better, fold worse than a weak pair.
  [Street.Flop]: { call: 0.16, raise: 0.22 },
  [Street.Turn]: { call: 0.18, raise: 0.24 },
  [Street.River]: { call: 0.2, raise: 0.28 },
};

/**
 * The competent tier: hand strength against pot odds, no simulation.
 *
 * Its identity is the pot-odds gate — it calls a cheap price with a hand that
 * would otherwise fold, because the price justifies it. That is the single
 * idea separating a bot that understands poker from one that only sorts hands.
 *
 * It never bluffs, which makes it fully deterministic given a view and so the
 * easiest tier to unit-test.
 */
export const mediumPolicy: BotPolicy = (view) => {
  if (view.legalActions.length === 0) return passiveDecision(view);

  const strength =
    view.street === Street.Preflop
      ? preflopStrength(view.holeCards)
      : postflopStrength(view.holeCards, view.board);

  const thresholds = THRESHOLDS[view.street] ?? THRESHOLDS[Street.Flop];
  const callAt = thresholds?.call ?? 0.4;
  const raiseAt = thresholds?.raise ?? 0.7;

  const raise = raiseOption(view);
  if (raise && strength > raiseAt) {
    return { type: raise.type, amount: betSize(view, 0.6) };
  }

  // Nothing to call: take the free card rather than betting a weak hand.
  if (view.toCall <= 0) {
    return passiveDecision(view);
  }

  const odds = potOdds(view);

  // The pot-odds gate. A hand below the calling threshold is still worth a
  // call when the price is low enough relative to what is already out there.
  if (strength > callAt || strength > odds * 1.1) {
    if (can(view, ActionType.Call)) return { type: ActionType.Call, amount: 0 };
  }

  return passiveDecision(view);
};
