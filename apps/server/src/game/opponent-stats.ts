import type { HandState, OpponentProfile } from '@app/poker';

/**
 * Raw counters, from which the ratios in `OpponentProfile` are derived.
 *
 * Kept separate so a ratio is never stored and then updated incrementally,
 * which is how averages drift.
 */
interface Counters {
  hands: number;
  /** Hands where they put money in preflop by choice, blinds excluded. */
  voluntary: number;
  preflopRaises: number;
  postflopBets: number;
  postflopCalls: number;
  /** Times they faced a postflop bet. */
  facedBet: number;
  foldedToBet: number;
}

/**
 * Opponent reads, per table.
 *
 * Held in memory and lost on restart, which matches how the table's hand
 * state already works. Persisting them is possible but of marginal value: a
 * read is only useful while the same players are still sitting there.
 */
const byTable = new Map<string, Map<string, Counters>>();

function counters(tableId: string, playerId: string): Counters {
  let table = byTable.get(tableId);
  if (!table) {
    table = new Map();
    byTable.set(tableId, table);
  }

  let entry = table.get(playerId);
  if (!entry) {
    entry = {
      hands: 0,
      voluntary: 0,
      preflopRaises: 0,
      postflopBets: 0,
      postflopCalls: 0,
      facedBet: 0,
      foldedToBet: 0,
    };
    table.set(playerId, entry);
  }
  return entry;
}

/**
 * Folds one finished hand into the counters.
 *
 * Reading the recorded actions afterwards means nothing has to be tracked
 * while the hand is in progress, so this cannot slow down the path that has
 * to feel instant.
 */
export function recordHand(tableId: string, hand: HandState): void {
  for (const player of hand.players) {
    counters(tableId, player.id).hands += 1;
  }

  // Whether a bet was outstanding when each action was taken, per street.
  let betOutstanding = false;
  let currentStreet: string | null = null;

  for (const action of hand.actions) {
    if (action.street !== currentStreet) {
      currentStreet = action.street;
      betOutstanding = false;
    }

    const entry = counters(tableId, action.playerId);
    const preflop = action.street === 'preflop';

    switch (action.type) {
      case 'post_blind':
        // Posting is compulsory, so it says nothing about how they play.
        break;

      case 'call':
        if (preflop) entry.voluntary += 1;
        else entry.postflopCalls += 1;
        if (!preflop && betOutstanding) entry.facedBet += 1;
        break;

      case 'bet':
      case 'raise':
        if (preflop) {
          entry.voluntary += 1;
          entry.preflopRaises += 1;
        } else {
          entry.postflopBets += 1;
          if (betOutstanding) entry.facedBet += 1;
        }
        betOutstanding = true;
        break;

      case 'fold':
        if (!preflop && betOutstanding) {
          entry.facedBet += 1;
          entry.foldedToBet += 1;
        }
        break;

      default:
        break;
    }
  }
}

/** The reads a bot at this table can use. */
export function profilesFor(tableId: string): Map<string, OpponentProfile> {
  const table = byTable.get(tableId);
  const profiles = new Map<string, OpponentProfile>();
  if (!table) return profiles;

  for (const [playerId, entry] of table) {
    if (entry.hands === 0) continue;

    profiles.set(playerId, {
      handsObserved: entry.hands,
      vpip: entry.voluntary / entry.hands,
      pfr: entry.preflopRaises / entry.hands,
      // Treat zero calls as maximally aggressive rather than dividing by zero.
      aggressionFactor:
        entry.postflopCalls === 0
          ? entry.postflopBets > 0
            ? 10
            : 0
          : entry.postflopBets / entry.postflopCalls,
      foldToBet: entry.facedBet === 0 ? 0 : entry.foldedToBet / entry.facedBet,
    });
  }

  return profiles;
}

export function forgetTable(tableId: string): void {
  byTable.delete(tableId);
}

export function forgetAll(): void {
  byTable.clear();
}
