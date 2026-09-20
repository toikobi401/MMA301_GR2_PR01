import { ActionType } from '../types';
import { equity, iterationsFor } from './monte-carlo';
import { betSize, can, passiveDecision, position, potOdds, raiseOption } from './strength';
import type { BotContext, BotDecision, BotPolicy } from './types';
import type { BotView } from '../bot-view';

/** Threshold adjustments a tier above this one can apply. */
export interface HardAdjustments {
  /** Added to the raw equity estimate. Negative means play more cautiously. */
  equityShift?: number;
  /** Added to the raise threshold. Negative means value-bet thinner. */
  raiseShift?: number;
  /** Added to the call threshold. Negative means call wider. */
  callShift?: number;
  /** Replaces the default bluff frequency. */
  bluffChance?: number;
  /** Pot fraction used when value betting. */
  valueBetFraction?: number;
}

const DEFAULT_BLUFF_CHANCE = 0.18;

/**
 * Equity-driven decision, shared by hard and expert.
 *
 * Expert passes adjustments derived from opponent reads; hard passes none.
 * Keeping the body here means expert stays a thin readable layer rather than
 * a copy that can drift.
 */
export function decideFromEquity(
  view: BotView,
  ctx: BotContext,
  adjustments: HardAdjustments = {},
): BotDecision {
  if (view.legalActions.length === 0) return passiveDecision(view);

  const opponents = Math.max(0, view.liveCount - 1);
  if (opponents === 0) return passiveDecision(view);

  const raw = equity({
    holeCards: view.holeCards,
    board: view.board,
    opponents,
    iterations: iterationsFor(view.board.length),
    random: ctx.random,
  });

  const win = Math.max(0, Math.min(1, raw + (adjustments.equityShift ?? 0)));
  const odds = potOdds(view);
  const place = position(view);

  // Acting last is worth real equity: every opponent has already committed to
  // a line, so marginal hands become playable.
  const positional = place === 'late' ? 0.05 : 0;

  // Pot odds are the price of *continuing*, so they answer "should I call".
  // They say nothing about whether to bet: with nothing to call the odds are
  // zero, and using them as a betting threshold would value-bet every hand.
  // Betting needs an absolute standard — roughly, better than an even chance
  // against the field.
  const facingBet = view.toCall > 0;
  const raiseAt = facingBet
    ? odds + 0.1 - positional + (adjustments.raiseShift ?? 0)
    : 0.55 - positional + (adjustments.raiseShift ?? 0);
  const callAt = odds - positional * 0.6 + (adjustments.callShift ?? 0);

  const raise = raiseOption(view);

  if (raise && win > raiseAt) {
    // Bet bigger with more equity: 0.5 pot at 0.6 equity rising to 1.0 pot at
    // 0.9, so the sizing itself carries information about hand strength.
    const base = adjustments.valueBetFraction ?? 0.5;
    const scaled = base + Math.max(0, (win - 0.6) / 0.3) * 0.5;
    return { type: raise.type, amount: betSize(view, Math.min(1, scaled)) };
  }

  // Bluff, but rarely and only where a bluff makes sense: nothing to call, a
  // weak hand, last to act, and few enough opponents that one fold ends it.
  if (
    raise &&
    view.toCall <= 0 &&
    win < 0.35 &&
    place === 'late' &&
    view.liveCount <= 3 &&
    ctx.random() < (adjustments.bluffChance ?? DEFAULT_BLUFF_CHANCE)
  ) {
    return { type: raise.type, amount: betSize(view, 0.6) };
  }

  if (view.toCall <= 0) return passiveDecision(view);

  if (win > callAt && can(view, ActionType.Call)) {
    return { type: ActionType.Call, amount: 0 };
  }

  return passiveDecision(view);
}

/**
 * The strong tier: Monte Carlo equity against pot odds, position aware, with
 * an occasional bluff.
 *
 * Unlike medium it needs no hand-strength heuristic at all — simulating the
 * runout answers "how often do I win this" directly, including preflop.
 */
export const hardPolicy: BotPolicy = (view, ctx) => decideFromEquity(view, ctx);
