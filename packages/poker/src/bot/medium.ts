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

/** Thresholds loosen as the board fills and hands become better defined. */
const THRESHOLDS: Record<string, { call: number; raise: number }> = {
  [Street.Preflop]: { call: 0.45, raise: 0.72 },
  [Street.Flop]: { call: 0.4, raise: 0.68 },
  [Street.Turn]: { call: 0.42, raise: 0.7 },
  [Street.River]: { call: 0.45, raise: 0.74 },
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
