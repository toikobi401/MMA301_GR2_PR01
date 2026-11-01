import type { BotView } from '../bot-view';
import { rankValue, suitOf, type Card } from '../cards';
import { evaluateHand } from '../evaluator';
import { ActionType, PlayerStatus, type LegalAction } from '../types';
import type { BotDecision } from './types';

/**
 * Preflop hand strength in [0, 1], via the Chen formula.
 *
 * `evaluateHand` throws below five cards, so it cannot be used preflop at
 * all. Chen is about twenty lines, needs no lookup table, and is accurate
 * enough that the difference is invisible at the table. A 169-entry table is
 * the upgrade path if it ever matters.
 */
export function preflopStrength(holeCards: readonly Card[]): number {
  const first = holeCards[0];
  const second = holeCards[1];
  if (!first || !second) return 0;

  const highValue = Math.max(rankValue(first), rankValue(second));
  const lowValue = Math.min(rankValue(first), rankValue(second));
  const paired = rankValue(first) === rankValue(second);
  const suited = suitOf(first) === suitOf(second);

  // Chen scores the high card: A=10, K=8, Q=7, J=6, then rank/2 down to 1.
  const chenHigh = (value: number): number => {
    if (value === 12) return 10; // ace
    if (value === 11) return 8; // king
    if (value === 10) return 7; // queen
    if (value === 9) return 6; // jack
    return (value + 2) / 2; // ten down to deuce
  };

  let score = chenHigh(highValue);

  if (paired) {
    score = Math.max(score * 2, 5);
  } else {
    if (suited) score += 2;

    const gap = highValue - lowValue - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;

    // Straight bonus: connected low cards make straights more often than
    // their raw card values suggest.
    if (gap <= 1 && highValue < 10) score += 1;
  }

  // Chen's practical range is about [-1, 20]; normalise into [0, 1].
  return Math.max(0, Math.min(1, (score + 1) / 21));
}

/**
 * Postflop hand strength in [0, 1].
 *
 * The made-hand category dominates; tiebreakers contribute a little so that
 * top pair beats bottom pair. A board-texture penalty stops the bot treating
 * a pair that the whole table shares as if it were its own.
 */
export function postflopStrength(
  holeCards: readonly Card[],
  board: readonly Card[],
): number {
  const cards = [...holeCards, ...board];
  if (cards.length < 5) return preflopStrength(holeCards);

  const value = evaluateHand(cards);
  const base = value.category / 8;

  // Top tiebreaker scaled into the gap between categories.
  const top = value.tiebreakers[0] ?? 0;
  const refinement = (top / 12) * (1 / 8) * 0.8;

  // How much of the hand comes from the board alone? If the board plays by
  // itself, everyone has it and the hand is worth less than it looks.
  let penalty = 0;
  if (board.length >= 5) {
    const boardOnly = evaluateHand(board);
    if (boardOnly.category >= value.category) penalty = 0.15;
  }

  return Math.max(0, Math.min(1, base + refinement - penalty));
}

/**
 * The price of continuing, as a fraction of the pot after calling.
 *
 * Zero when checking is free — there is no price to compare against.
 */
export function potOdds(view: BotView): number {
  if (view.toCall <= 0) return 0;
  return view.toCall / (view.potTotal + view.toCall);
}

export type TablePosition = 'early' | 'middle' | 'late' | 'blinds';

/**
 * Where the bot sits relative to the button among players still in the hand.
 *
 * Acting late is worth real equity: every opponent has already shown what
 * they intend to do.
 */
export function position(view: BotView): TablePosition {
  const live = view.players
    .filter(
      (player) =>
        player.status === PlayerStatus.Active || player.status === PlayerStatus.AllIn,
    )
    .map((player) => player.seat)
    .sort((a, b) => a - b);

  if (live.length <= 2) return 'late'; // heads-up: the button acts last postflop

  // Seat order starting after the button, which is the order players act on
  // every street except preflop.
  const ordered = [
    ...live.filter((seat) => seat > view.buttonSeat),
    ...live.filter((seat) => seat <= view.buttonSeat),
  ];
  const place = ordered.indexOf(view.self.seat);
  if (place < 0) return 'middle';

  // Ordered runs small blind, big blind, then round to the button last.
  if (place <= 1) return 'blinds';
  const fromEnd = ordered.length - 1 - place;
  if (fromEnd <= 1) return 'late';
  if (place <= Math.floor(ordered.length / 2)) return 'early';
  return 'middle';
}

/** The bet or raise option, if raising is legal right now. */
export function raiseOption(view: BotView): LegalAction | undefined {
  return view.legalActions.find(
    (action) => action.type === ActionType.Bet || action.type === ActionType.Raise,
  );
}

export function can(view: BotView, type: BotDecision['type']): boolean {
  return view.legalActions.some((action) => action.type === type);
}

/**
 * Converts a pot fraction into a legal total street commitment.
 *
 * This is the most error-prone conversion in the whole feature: the engine's
 * `min` and `max` are TOTAL commitments for the street, not increments on top
 * of the current bet. Getting it wrong produces raises the engine rejects, or
 * silently tiny ones. It exists once, and every tier calls it.
 */
export function betSize(view: BotView, potFraction: number): number {
  const option = raiseOption(view);
  if (!option) return 0;

  const min = option.min ?? view.currentBet + view.lastRaiseSize;
  const max = option.max ?? view.self.committed + view.self.stack;

  // A pot-sized raise is: call the outstanding bet, then bet the pot that
  // would exist after that call.
  const target = view.currentBet + Math.round((view.potTotal + view.toCall) * potFraction);

  return Math.max(min, Math.min(max, target));
}

/** The safest legal action: check if free, otherwise fold. */
export function passiveDecision(view: BotView): BotDecision {
  if (can(view, ActionType.Check)) return { type: ActionType.Check, amount: 0 };
  return { type: ActionType.Fold, amount: 0 };
}

/**
 * Forces a policy's output into something the engine will accept.
 *
 * The driver never trusts a policy: a buggy tier must degrade to a legal
 * action, not throw the table into an error state or stall the hand for the
 * full thirty-second clock.
 */
export function clampDecision(view: BotView, decision: BotDecision): BotDecision {
  if (!can(view, decision.type)) return passiveDecision(view);

  if (decision.type === ActionType.Bet || decision.type === ActionType.Raise) {
    const option = raiseOption(view);
    if (!option) return passiveDecision(view);

    const min = option.min ?? 0;
    const max = option.max ?? min;
    const amount = Math.round(decision.amount);

    return {
      // The engine emits `bet` with no outstanding bet and `raise` otherwise;
      // sending the wrong verb is rejected, so take the verb it offered.
      type: option.type,
      amount: Math.max(min, Math.min(max, Number.isFinite(amount) ? amount : min)),
    };
  }

  return { type: decision.type, amount: 0 };
}
