import type { Card } from './cards';
import { legalActions } from './hand';
import {
  PlayerStatus,
  type HandState,
  type LegalAction,
  type PlayerStatusValue,
  type RecordedAction,
  type StreetValue,
} from './types';

/**
 * One opponent, as a bot is allowed to see them.
 *
 * There is deliberately no `holeCards` key — not an empty array, absent from
 * the type. A policy that reaches for an opponent's cards fails to compile
 * rather than silently receiving `[]` and appearing to work.
 */
export interface BotViewPlayer {
  readonly id: string;
  readonly seat: number;
  readonly stack: number;
  readonly committed: number;
  readonly totalCommitted: number;
  readonly status: PlayerStatusValue;
}

/**
 * Everything a bot is allowed to know.
 *
 * This is the only type a bot policy accepts. `HandState` carries the
 * remaining deck and every player's hole cards, so a bot reading it would
 * have perfect information and would win in ways nobody could detect — it
 * would simply look lucky. Making the policy signature take `BotView`
 * instead turns that from a review problem into a compile error.
 *
 * Card visibility is decided in three places in this repository. If you
 * change what a player may see, change all three:
 *   - `redactForPlayer` in hand.ts       (wire format for tests)
 *   - `Table.viewFor` in the server      (wire format for clients)
 *   - `buildBotView` below               (what bots see)
 */
export interface BotView {
  readonly handId: string;
  readonly street: StreetValue;
  readonly board: readonly Card[];
  /** The bot's own two cards. */
  readonly holeCards: readonly Card[];
  readonly self: {
    readonly id: string;
    readonly seat: number;
    readonly stack: number;
    readonly committed: number;
    readonly totalCommitted: number;
  };
  /** Every player including self, with no hole cards on any of them. */
  readonly players: readonly BotViewPlayer[];
  readonly buttonSeat: number;
  readonly currentBet: number;
  readonly lastRaiseSize: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  /** Chips already in the pot, plus everything committed this street. */
  readonly potTotal: number;
  /** Chips the bot must put in to continue. Zero when checking is free. */
  readonly toCall: number;
  readonly legalActions: readonly LegalAction[];
  /** This hand's action history. Carries no card information. */
  readonly actions: readonly RecordedAction[];
  /** Players who can still act — excludes folded and all-in. */
  readonly activeCount: number;
  /** Players still in the hand, all-in included. */
  readonly liveCount: number;
}

export class BotViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotViewError';
  }
}

/**
 * Builds the redacted view a bot decides from.
 *
 * Arrays are copied rather than aliased, and every field is readonly, so a
 * policy cannot mutate the live hand it was handed. That matters because
 * `applyAction` mutates `HandState` in place — an aliased board would let a
 * buggy policy corrupt the hand for everyone.
 */
export function buildBotView(state: HandState, botId: string): BotView {
  const self = state.players.find((player) => player.id === botId);
  if (!self) {
    throw new BotViewError(`${botId} is not in hand ${state.handId}`);
  }

  const committedThisStreet = state.players.reduce(
    (sum, player) => sum + player.committed,
    0,
  );
  const inPots = state.pots.reduce((sum, pot) => sum + pot.amount, 0);

  return {
    handId: state.handId,
    street: state.street,
    board: [...state.board],
    holeCards: [...self.holeCards],
    self: {
      id: self.id,
      seat: self.seat,
      stack: self.stack,
      committed: self.committed,
      totalCommitted: self.totalCommitted,
    },
    players: state.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      stack: player.stack,
      committed: player.committed,
      totalCommitted: player.totalCommitted,
      status: player.status,
    })),
    buttonSeat: state.buttonSeat,
    currentBet: state.currentBet,
    lastRaiseSize: state.lastRaiseSize,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    // `pots` is only populated when the hand finishes, so mid-hand the pot is
    // whatever players have committed. Adding both is correct in either case
    // because committed resets to zero once a street is collected.
    potTotal: inPots + committedThisStreet,
    toCall: Math.max(0, state.currentBet - self.committed),
    legalActions: legalActions(state, botId).map((action) => ({ ...action })),
    actions: state.actions.map((action) => ({ ...action })),
    activeCount: state.players.filter((player) => player.status === PlayerStatus.Active)
      .length,
    liveCount: state.players.filter(
      (player) =>
        player.status === PlayerStatus.Active || player.status === PlayerStatus.AllIn,
    ).length,
  };
}
