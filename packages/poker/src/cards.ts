/** Rank order matters: index is the comparison value. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

/** A card is its two-character string, e.g. "As", "Th", "2c". */
export type Card = `${Rank}${Suit}`;

export function makeCard(rank: Rank, suit: Suit): Card {
  return `${rank}${suit}`;
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

/** 0 for a deuce, 12 for an ace. */
export function rankValue(card: Card): number {
  return RANKS.indexOf(rankOf(card));
}

export function isCard(value: string): value is Card {
  return (
    value.length === 2 &&
    RANKS.includes(value[0] as Rank) &&
    SUITS.includes(value[1] as Suit)
  );
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

/**
 * Fisher-Yates using an injected random source.
 *
 * The source is a parameter so production can pass a cryptographically secure
 * generator while tests pass a seeded one. Math.random must never be used to
 * shuffle a real deck — its output is predictable from a few observed hands.
 */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
