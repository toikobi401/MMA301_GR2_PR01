import { freshDeck, shuffle, type Card } from './cards';
import { compareHands, describeHand, evaluateHand } from './evaluator';
import { buildPots, splitPot } from './pots';
import {
  ActionType,
  PlayerStatus,
  Street,
  type Action,
  type HandResult,
  type HandState,
  type LegalAction,
  type Player,
  type StreetValue,
} from './types';

export interface StartHandOptions {
  handId: string;
  /** Seat order matters; index 0 is seat 0. */
  players: Array<{ id: string; seat: number; stack: number }>;
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  random: () => number;
  now?: number;
}

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidActionError';
  }
}

/** Players still able to act — excludes folded and all-in. */
function activePlayers(state: HandState): Player[] {
  return state.players.filter((player) => player.status === PlayerStatus.Active);
}

/** Players still in the hand, all-in included. */
function livePlayers(state: HandState): Player[] {
  return state.players.filter(
    (player) => player.status === PlayerStatus.Active || player.status === PlayerStatus.AllIn,
  );
}

/** Seat order starting after `seat`, wrapping around the table. */
function seatOrderAfter(state: HandState, seat: number): Player[] {
  const seated = [...state.players].sort((a, b) => a.seat - b.seat);
  const index = seated.findIndex((player) => player.seat > seat);
  const start = index === -1 ? 0 : index;
  return [...seated.slice(start), ...seated.slice(0, start)];
}

function findPlayer(state: HandState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new InvalidActionError(`Unknown player ${playerId}`);
  return player;
}

/**
 * Moves a fixed number of chips from a player's stack into the pot.
 * A player who cannot cover the amount goes all in for what they have.
 */
function commit(player: Player, amount: number): number {
  const paid = Math.min(amount, player.stack);
  player.stack -= paid;
  player.committed += paid;
  player.totalCommitted += paid;
  if (player.stack === 0) player.status = PlayerStatus.AllIn;
  return paid;
}

export function startHand(options: StartHandOptions): HandState {
  const { handId, buttonSeat, smallBlind, bigBlind, random } = options;
  const now = options.now ?? Date.now();

  if (options.players.length < 2) {
    throw new InvalidActionError('A hand needs at least 2 players');
  }

  const deck = shuffle(freshDeck(), random);

  const players: Player[] = options.players.map((entry) => ({
    id: entry.id,
    seat: entry.seat,
    stack: entry.stack,
    status: entry.stack > 0 ? PlayerStatus.Active : PlayerStatus.SittingOut,
    committed: 0,
    totalCommitted: 0,
    holeCards: [],
  }));

  const state: HandState = {
    handId,
    players,
    buttonSeat,
    street: Street.Preflop,
    board: [],
    deck,
    actingPlayerId: null,
    currentBet: 0,
    lastRaiseSize: bigBlind,
    smallBlind,
    bigBlind,
    pots: [],
    actions: [],
    startedAt: now,
    results: null,
  };

  // Deal two cards each, one at a time, starting left of the button — the
  // order real dealers use, and what a replay should show.
  const order = seatOrderAfter(state, buttonSeat).filter(
    (player) => player.status === PlayerStatus.Active,
  );
  for (let round = 0; round < 2; round += 1) {
    for (const player of order) {
      const card = state.deck.pop();
      if (card) player.holeCards.push(card);
    }
  }

  postBlinds(state, order);
  return state;
}

/**
 * Posts blinds and sets the first player to act.
 *
 * Heads-up is the exception everyone gets wrong: with two players the button
 * posts the small blind and acts first preflop, then acts last on every later
 * street.
 */
function postBlinds(state: HandState, order: Player[]): void {
  const headsUp = order.length === 2;
  const button = order.find((player) => player.seat === state.buttonSeat);

  const smallBlindPlayer = headsUp ? (button ?? order[0]) : order[0];
  const bigBlindPlayer = headsUp
    ? order.find((player) => player.id !== smallBlindPlayer?.id)
    : order[1];

  if (!smallBlindPlayer || !bigBlindPlayer) {
    throw new InvalidActionError('Cannot assign blinds');
  }

  const smallPaid = commit(smallBlindPlayer, state.smallBlind);
  state.actions.push({
    playerId: smallBlindPlayer.id,
    type: ActionType.PostBlind,
    amount: smallPaid,
    street: Street.Preflop,
    at: 0,
  });

  const bigPaid = commit(bigBlindPlayer, state.bigBlind);
  state.actions.push({
    playerId: bigBlindPlayer.id,
    type: ActionType.PostBlind,
    amount: bigPaid,
    street: Street.Preflop,
    at: 0,
  });

  state.currentBet = state.bigBlind;
  state.lastRaiseSize = state.bigBlind;

  // Preflop action starts left of the big blind, or on the button heads-up.
  const afterBigBlind = seatOrderAfter(state, bigBlindPlayer.seat).filter(
    (player) => player.status === PlayerStatus.Active,
  );
  state.actingPlayerId = (headsUp ? smallBlindPlayer : afterBigBlind[0])?.id ?? null;
}

/** What the player to act may legally do right now. */
export function legalActions(state: HandState, playerId: string): LegalAction[] {
  if (state.actingPlayerId !== playerId) return [];

  const player = findPlayer(state, playerId);
  if (player.status !== PlayerStatus.Active) return [];

  const toCall = state.currentBet - player.committed;
  const actions: LegalAction[] = [{ type: ActionType.Fold }];

  if (toCall <= 0) {
    actions.push({ type: ActionType.Check });
  } else {
    actions.push({ type: ActionType.Call, min: Math.min(toCall, player.stack) });
  }

  // A raise must be at least the size of the previous raise, except when a
  // player's remaining stack is smaller — then they may still shove.
  const maxTotal = player.committed + player.stack;
  const minRaiseTotal = state.currentBet + state.lastRaiseSize;

  if (maxTotal > state.currentBet) {
    actions.push({
      type: state.currentBet === 0 ? ActionType.Bet : ActionType.Raise,
      min: Math.min(minRaiseTotal, maxTotal),
      max: maxTotal,
    });
  }

  return actions;
}

/**
 * Applies one action and advances the hand.
 * Mutates and returns `state`; the caller owns persistence.
 */
export function applyAction(state: HandState, action: Action, now?: number): HandState {
  if (state.street === Street.Complete) {
    throw new InvalidActionError('Hand is already complete');
  }
  if (state.actingPlayerId !== action.playerId) {
    throw new InvalidActionError(`It is not ${action.playerId}'s turn`);
  }

  const player = findPlayer(state, action.playerId);
  if (player.status !== PlayerStatus.Active) {
    throw new InvalidActionError(`${action.playerId} cannot act`);
  }

  const toCall = state.currentBet - player.committed;
  const at = (now ?? Date.now()) - state.startedAt;
  let recordedAmount = 0;

  switch (action.type) {
    case ActionType.Fold: {
      player.status = PlayerStatus.Folded;
      break;
    }

    case ActionType.Check: {
      if (toCall > 0) {
        throw new InvalidActionError(`Cannot check facing a bet of ${toCall}`);
      }
      break;
    }

    case ActionType.Call: {
      if (toCall <= 0) throw new InvalidActionError('Nothing to call');
      recordedAmount = commit(player, toCall);
      break;
    }

    case ActionType.Bet:
    case ActionType.Raise: {
      // `amount` is the player's total commitment for this street, not the
      // increment — the convention every poker client uses.
      const target = action.amount;
      const maxTotal = player.committed + player.stack;

      if (target <= state.currentBet) {
        throw new InvalidActionError(`Raise must exceed the current bet of ${state.currentBet}`);
      }
      if (target > maxTotal) {
        throw new InvalidActionError(`Cannot commit ${target}, stack allows ${maxTotal}`);
      }

      const minRaiseTotal = state.currentBet + state.lastRaiseSize;
      const isAllIn = target === maxTotal;
      if (target < minRaiseTotal && !isAllIn) {
        throw new InvalidActionError(`Minimum raise is ${minRaiseTotal}`);
      }

      const raiseSize = target - state.currentBet;
      recordedAmount = commit(player, target - player.committed);

      // An all-in short of a full raise does not reopen betting, so only
      // update the raise size when the raise was legal-sized.
      if (raiseSize >= state.lastRaiseSize) state.lastRaiseSize = raiseSize;
      state.currentBet = target;
      break;
    }

    default:
      throw new InvalidActionError(`Unsupported action ${action.type}`);
  }

  state.actions.push({
    playerId: action.playerId,
    type: action.type,
    amount: recordedAmount,
    street: state.street,
    at,
  });

  advance(state, now);
  return state;
}

/**
 * Reads the current street without the narrowing TypeScript applies after an
 * early `return` on a street comparison. The state is mutated by
 * `dealNextStreet` between those checks, so the narrowed type is wrong.
 */
function currentStreet(state: HandState): StreetValue {
  return state.street;
}

/** Moves to the next actor, the next street, or the end of the hand. */
function advance(state: HandState, now?: number): void {
  const live = livePlayers(state);

  // Everyone else folded — the last player standing takes it uncontested.
  if (live.length <= 1) {
    finish(state, now);
    return;
  }

  const active = activePlayers(state);

  // Nobody can act (all remaining players are all in): run the board out.
  if (active.length === 0) {
    while (state.street !== Street.River && state.street !== Street.Showdown) {
      dealNextStreet(state);
    }
    finish(state, now);
    return;
  }

  const next = nextToAct(state);
  if (next) {
    state.actingPlayerId = next.id;
    return;
  }

  // Street is settled.
  if (state.street === Street.River) {
    finish(state, now);
    return;
  }

  dealNextStreet(state);

  // Only one player can still act, and no one can put money in against them.
  if (activePlayers(state).length <= 1 && livePlayers(state).length > 1) {
    const stillBetting = activePlayers(state).some(
      (player) => player.committed < state.currentBet,
    );
    if (!stillBetting) {
      // `currentStreet` is read through a widened local because TypeScript
      // narrowed `state.street` at the early return above and cannot see that
      // dealNextStreet reassigns it.
      while (
        currentStreet(state) !== Street.River &&
        currentStreet(state) !== Street.Showdown
      ) {
        dealNextStreet(state);
      }
      finish(state, now);
      return;
    }
  }

  const first = nextToAct(state);
  state.actingPlayerId = first?.id ?? null;
  if (!first) {
    if (currentStreet(state) === Street.River) finish(state, now);
    else advance(state, now);
  }
}

/**
 * The next player who still owes a decision, or null when the street is done.
 *
 * A street ends when every active player has matched the current bet and has
 * acted at least once. The big blind's option preflop falls out of this: they
 * have chips in but have not acted, so they still get to raise.
 */
function nextToAct(state: HandState): Player | null {
  const actingId = state.actingPlayerId;
  const reference = actingId
    ? findPlayer(state, actingId).seat
    : state.street === Street.Preflop
      ? state.buttonSeat
      : state.buttonSeat;

  const candidates = seatOrderAfter(state, reference).filter(
    (player) => player.status === PlayerStatus.Active,
  );

  for (const player of candidates) {
    if (player.committed < state.currentBet) return player;
    if (!hasActedThisStreet(state, player.id)) return player;
  }

  return null;
}

function hasActedThisStreet(state: HandState, playerId: string): boolean {
  return state.actions.some(
    (action) =>
      action.street === state.street &&
      action.playerId === playerId &&
      action.type !== ActionType.PostBlind,
  );
}

const STREET_ORDER: StreetValue[] = [
  Street.Preflop,
  Street.Flop,
  Street.Turn,
  Street.River,
  Street.Showdown,
];

function dealNextStreet(state: HandState): void {
  // Collect the street's bets into the pot structure before moving on.
  for (const player of state.players) {
    player.committed = 0;
  }
  state.currentBet = 0;
  state.lastRaiseSize = state.bigBlind;

  const index = STREET_ORDER.indexOf(state.street);
  const next = STREET_ORDER[index + 1];
  if (!next) return;

  state.street = next;

  // Burn a card before each community deal, as at a real table.
  if (next === Street.Flop) {
    state.deck.pop();
    for (let i = 0; i < 3; i += 1) {
      const card = state.deck.pop();
      if (card) state.board.push(card);
    }
  } else if (next === Street.Turn || next === Street.River) {
    state.deck.pop();
    const card = state.deck.pop();
    if (card) state.board.push(card);
  }

  state.actingPlayerId = null;
}

/** Awards the pots and marks the hand complete. */
function finish(state: HandState, now?: number): void {
  state.pots = buildPots(state.players);
  const live = livePlayers(state);
  const results: HandResult[] = [];

  // Seat order after the button decides who gets odd chips.
  const orderedIds = seatOrderAfter(state, state.buttonSeat).map((player) => player.id);

  if (live.length === 1) {
    // Uncontested: no cards are shown.
    const winner = live[0];
    if (winner) {
      for (const [index, pot] of state.pots.entries()) {
        winner.stack += pot.amount;
        results.push({
          playerId: winner.id,
          potIndex: index,
          amount: pot.amount,
          handDescription: null,
          cards: null,
        });
      }
    }
  } else {
    const shown = new Map<string, ReturnType<typeof evaluateHand>>();
    for (const player of live) {
      shown.set(player.id, evaluateHand([...player.holeCards, ...state.board]));
    }

    for (const [index, pot] of state.pots.entries()) {
      const contenders = pot.eligiblePlayerIds
        .map((id) => ({ id, value: shown.get(id) }))
        .filter((entry): entry is { id: string; value: NonNullable<typeof entry.value> } =>
          Boolean(entry.value),
        );

      if (contenders.length === 0) continue;

      let best = contenders[0];
      if (!best) continue;
      for (const contender of contenders) {
        if (compareHands(contender.value, best.value) > 0) best = contender;
      }

      const winners = contenders
        .filter((contender) => compareHands(contender.value, best.value) === 0)
        .map((contender) => contender.id);

      const payouts = splitPot(pot.amount, winners, orderedIds);
      for (const [playerId, amount] of payouts) {
        const player = findPlayer(state, playerId);
        player.stack += amount;
        const value = shown.get(playerId);
        results.push({
          playerId,
          potIndex: index,
          amount,
          handDescription: value ? describeHand(value) : null,
          cards: value ? value.cards : null,
        });
      }
    }
  }

  state.street = Street.Complete;
  state.actingPlayerId = null;
  state.results = results;
  void now;
}

/**
 * The state as one player may see it.
 * Other players' hole cards are removed, never merely hidden client-side.
 */
export function redactForPlayer(state: HandState, viewerId: string): HandState {
  const showdown = state.street === Street.Complete && (state.results?.length ?? 0) > 0;
  const contested = livePlayers(state).length > 1;

  return {
    ...state,
    // The deck must never leave the server: it is the rest of the shuffle.
    deck: [],
    players: state.players.map((player) => {
      if (player.id === viewerId) return { ...player };
      const reveal = showdown && contested && player.status !== PlayerStatus.Folded;
      return { ...player, holeCards: reveal ? [...player.holeCards] : [] };
    }),
  };
}

export type { Card };
