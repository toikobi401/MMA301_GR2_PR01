import type { Card } from './cards';

export const Street = {
  Preflop: 'preflop',
  Flop: 'flop',
  Turn: 'turn',
  River: 'river',
  Showdown: 'showdown',
  Complete: 'complete',
} as const;

export type StreetValue = (typeof Street)[keyof typeof Street];

export const ActionType = {
  Fold: 'fold',
  Check: 'check',
  Call: 'call',
  Bet: 'bet',
  Raise: 'raise',
  /** Not a player choice — posted automatically at the start of a hand. */
  PostBlind: 'post_blind',
} as const;

export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType];

export interface Action {
  playerId: string;
  type: ActionTypeValue;
  /** Chips put in by this action. Zero for fold and check. */
  amount: number;
}

/** An action plus the context needed to replay the hand later. */
export interface RecordedAction extends Action {
  street: StreetValue;
  /** Milliseconds since the hand started. */
  at: number;
}

export const PlayerStatus = {
  Active: 'active',
  Folded: 'folded',
  AllIn: 'all_in',
  /** Sitting at the table but not in this hand. */
  SittingOut: 'sitting_out',
} as const;

export type PlayerStatusValue = (typeof PlayerStatus)[keyof typeof PlayerStatus];

export interface Player {
  id: string;
  seat: number;
  /** Chips behind, not counting what is already in the pot. */
  stack: number;
  status: PlayerStatusValue;
  /** Chips committed on the current street. */
  committed: number;
  /** Chips committed across the whole hand — drives side-pot construction. */
  totalCommitted: number;
  holeCards: Card[];
}

export interface Pot {
  amount: number;
  /** Players eligible to win this pot. */
  eligiblePlayerIds: string[];
}

export interface HandState {
  handId: string;
  players: Player[];
  /** Seat index of the dealer button. */
  buttonSeat: number;
  street: StreetValue;
  board: Card[];
  deck: Card[];
  /** Whose turn it is, or null when the street is settled. */
  actingPlayerId: string | null;
  /** Highest amount committed on this street. */
  currentBet: number;
  /** Size of the last bet or raise, the minimum for the next raise. */
  lastRaiseSize: number;
  smallBlind: number;
  bigBlind: number;
  pots: Pot[];
  actions: RecordedAction[];
  startedAt: number;
  /**
   * Set once the hand ends. Each entry is one player's share of one pot, so a
   * split pot produces several entries.
   */
  results: HandResult[] | null;
}

export interface HandResult {
  playerId: string;
  potIndex: number;
  amount: number;
  /** Absent when everyone else folded — no cards were shown. */
  handDescription: string | null;
  cards: Card[] | null;
}

export interface LegalAction {
  type: ActionTypeValue;
  /** For bet and raise: the smallest and largest legal total commitment. */
  min?: number;
  max?: number;
}
