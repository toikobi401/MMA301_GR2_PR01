import type { BotView } from '../bot-view';
import type { ActionTypeValue } from '../types';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface BotDecision {
  /** Never `post_blind` — blinds are posted by the engine, not chosen. */
  type: ActionTypeValue;
  /** Total street commitment for bet and raise. Zero for everything else. */
  amount: number;
}

/**
 * What the expert tier remembers about one opponent.
 *
 * Computed by folding over finished hands, so nothing needs tracking while a
 * hand is in progress.
 */
export interface OpponentProfile {
  readonly handsObserved: number;
  /** Fraction of hands where they put money in preflop by choice. */
  readonly vpip: number;
  /** Fraction of hands where they raised preflop. */
  readonly pfr: number;
  /** (bets + raises) / calls after the flop. */
  readonly aggressionFactor: number;
  /** Fraction of times they folded facing a postflop bet. */
  readonly foldToBet: number;
}

export interface BotContext {
  /**
   * Injected so a failing decision can be replayed exactly. Production passes
   * a crypto source; tests pass a seeded generator.
   */
  readonly random: () => number;
  /** Empty for every tier except expert. */
  readonly opponents: ReadonlyMap<string, OpponentProfile>;
}

/**
 * A bot's decision function.
 *
 * Synchronous and pure on purpose. A few thousand Monte Carlo iterations take
 * single-digit milliseconds, so there is no reason to make this async — and
 * not being async means a policy cannot perform I/O, which is where a
 * cheating implementation would go looking for information it should not have.
 */
export type BotPolicy = (view: BotView, ctx: BotContext) => BotDecision;
