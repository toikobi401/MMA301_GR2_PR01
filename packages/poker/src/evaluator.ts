import { RANKS, rankValue, suitOf, type Card, type Suit } from './cards';

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const;

export type HandCategoryValue = (typeof HandCategory)[keyof typeof HandCategory];

export const HAND_CATEGORY_NAMES: Record<HandCategoryValue, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.ThreeOfAKind]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.FourOfAKind]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export interface HandValue {
  category: HandCategoryValue;
  /**
   * Tie-breakers in descending significance. Two hands of the same category
   * are compared element by element, so [12, 8, 5] beats [12, 7, 6].
   */
  tiebreakers: number[];
  /** The exact five cards that make the hand, for replay and display. */
  cards: Card[];
}

/** Negative when a is worse, positive when a is better, 0 on an exact tie. */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;

  const length = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.tiebreakers[i] ?? -1;
    const right = b.tiebreakers[i] ?? -1;
    if (left !== right) return left - right;
  }
  return 0;
}

/**
 * Finds the highest straight in a set of rank values.
 * Returns the value of its top card, or null.
 *
 * The wheel (A-2-3-4-5) is the special case: the ace plays low, and the
 * straight's top card is the five, not the ace.
 */
function findStraightHigh(rankValues: Set<number>): number | null {
  for (let high = RANKS.length - 1; high >= 4; high -= 1) {
    let complete = true;
    for (let offset = 0; offset < 5; offset += 1) {
      if (!rankValues.has(high - offset)) {
        complete = false;
        break;
      }
    }
    if (complete) return high;
  }

  // Wheel: ace (12) plus 2,3,4,5 (0..3), ranked by its five.
  const wheel = [12, 0, 1, 2, 3];
  if (wheel.every((value) => rankValues.has(value))) return 3;

  return null;
}

/** Picks one card per requested rank value, in the order given. */
function cardsByRankValues(cards: readonly Card[], values: number[]): Card[] {
  const picked: Card[] = [];
  for (const value of values) {
    const match = cards.find((card) => rankValue(card) === value && !picked.includes(card));
    if (match) picked.push(match);
  }
  return picked;
}

/** Five consecutive cards of one suit ending at `high`, ace-low aware. */
function straightCards(cards: readonly Card[], high: number, suit?: Suit): Card[] {
  const values = high === 3 ? [3, 2, 1, 0, 12] : [high, high - 1, high - 2, high - 3, high - 4];
  const picked: Card[] = [];

  for (const value of values) {
    const match = cards.find(
      (card) => rankValue(card) === value && (suit === undefined || suitOf(card) === suit),
    );
    if (match) picked.push(match);
  }
  return picked;
}

/**
 * Evaluates the best five-card hand from five, six, or seven cards.
 *
 * Counts ranks and suits rather than enumerating all 21 five-card
 * combinations, so it stays fast enough to run on every showdown.
 */
export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length < 5) {
    throw new Error(`evaluateHand needs at least 5 cards, received ${cards.length}`);
  }

  const byRank = new Map<number, Card[]>();
  const bySuit = new Map<Suit, Card[]>();

  for (const card of cards) {
    const value = rankValue(card);
    const rankGroup = byRank.get(value);
    if (rankGroup) rankGroup.push(card);
    else byRank.set(value, [card]);

    const suit = suitOf(card);
    const suitGroup = bySuit.get(suit);
    if (suitGroup) suitGroup.push(card);
    else bySuit.set(suit, [card]);
  }

  const flushSuit = [...bySuit.entries()].find(([, group]) => group.length >= 5)?.[0];

  // Straight flush first — it outranks everything below.
  if (flushSuit) {
    const suited = bySuit.get(flushSuit) ?? [];
    const suitedValues = new Set(suited.map(rankValue));
    const high = findStraightHigh(suitedValues);
    if (high !== null) {
      return {
        category: HandCategory.StraightFlush,
        tiebreakers: [high],
        cards: straightCards(suited, high, flushSuit),
      };
    }
  }

  // Rank groups sorted by size then rank: quads first, then trips, then pairs.
  const groups = [...byRank.entries()]
    .map(([value, group]) => ({ value, count: group.length }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.value - a.value));

  const first = groups[0];
  const second = groups[1];

  if (first?.count === 4) {
    const kicker = groups.find((group) => group.value !== first.value)?.value ?? -1;
    return {
      category: HandCategory.FourOfAKind,
      tiebreakers: [first.value, kicker],
      cards: [
        ...(byRank.get(first.value) ?? []).slice(0, 4),
        ...cardsByRankValues(cards, [kicker]),
      ],
    };
  }

  if (first?.count === 3 && second && second.count >= 2) {
    return {
      category: HandCategory.FullHouse,
      tiebreakers: [first.value, second.value],
      cards: [
        ...(byRank.get(first.value) ?? []).slice(0, 3),
        ...(byRank.get(second.value) ?? []).slice(0, 2),
      ],
    };
  }

  if (flushSuit) {
    const suited = (bySuit.get(flushSuit) ?? [])
      .slice()
      .sort((a, b) => rankValue(b) - rankValue(a))
      .slice(0, 5);
    return {
      category: HandCategory.Flush,
      tiebreakers: suited.map(rankValue),
      cards: suited,
    };
  }

  const allValues = new Set(cards.map(rankValue));
  const straightHigh = findStraightHigh(allValues);
  if (straightHigh !== null) {
    return {
      category: HandCategory.Straight,
      tiebreakers: [straightHigh],
      cards: straightCards(cards, straightHigh),
    };
  }

  if (first?.count === 3) {
    const kickers = groups
      .filter((group) => group.value !== first.value)
      .map((group) => group.value)
      .sort((a, b) => b - a)
      .slice(0, 2);
    return {
      category: HandCategory.ThreeOfAKind,
      tiebreakers: [first.value, ...kickers],
      cards: [...(byRank.get(first.value) ?? []).slice(0, 3), ...cardsByRankValues(cards, kickers)],
    };
  }

  if (first?.count === 2 && second?.count === 2) {
    const highPair = Math.max(first.value, second.value);
    const lowPair = Math.min(first.value, second.value);
    const kicker =
      groups
        .filter((group) => group.value !== highPair && group.value !== lowPair)
        .map((group) => group.value)
        .sort((a, b) => b - a)[0] ?? -1;
    return {
      category: HandCategory.TwoPair,
      tiebreakers: [highPair, lowPair, kicker],
      cards: [
        ...(byRank.get(highPair) ?? []).slice(0, 2),
        ...(byRank.get(lowPair) ?? []).slice(0, 2),
        ...cardsByRankValues(cards, [kicker]),
      ],
    };
  }

  if (first?.count === 2) {
    const kickers = groups
      .filter((group) => group.value !== first.value)
      .map((group) => group.value)
      .sort((a, b) => b - a)
      .slice(0, 3);
    return {
      category: HandCategory.Pair,
      tiebreakers: [first.value, ...kickers],
      cards: [...(byRank.get(first.value) ?? []).slice(0, 2), ...cardsByRankValues(cards, kickers)],
    };
  }

  const high = [...allValues].sort((a, b) => b - a).slice(0, 5);
  return {
    category: HandCategory.HighCard,
    tiebreakers: high,
    cards: cardsByRankValues(cards, high),
  };
}

export function describeHand(value: HandValue): string {
  return HAND_CATEGORY_NAMES[value.category];
}
