import { freshDeck, type Card } from '../cards';
import { compareHands, evaluateHand } from '../evaluator';

export interface EquityOptions {
  readonly holeCards: readonly Card[];
  readonly board: readonly Card[];
  /** How many opponents are still in the hand, excluding this player. */
  readonly opponents: number;
  readonly iterations: number;
  readonly random: () => number;
}

/**
 * Probability of winning the hand, with ties counted as a fractional win.
 *
 * The candidate deck is built from a fresh deck minus the cards this player
 * can see. It does **not** read a deck from anywhere, because `BotView` has
 * none — the honest implementation is the only one available, which is the
 * point of that design.
 *
 * Opponents are dealt uniformly at random rather than from a weighted range.
 * That is the standard first approximation, and it errs on the pessimistic
 * side against tight opponents, so the bot plays slightly too cautiously
 * rather than exploitably loose. The expert tier corrects for it.
 *
 * Because the runout completes the board to five cards before evaluating,
 * `evaluateHand` always has enough cards — so preflop equity comes out of
 * simulation rather than needing a separate formula.
 */
export function equity(options: EquityOptions): number {
  const { holeCards, board, opponents, iterations, random } = options;

  if (opponents <= 0) return 1;
  if (holeCards.length !== 2) return 0;

  const seen = new Set<string>([...holeCards, ...board]);
  const candidates = freshDeck().filter((card) => !seen.has(card));

  const runout = 5 - board.length;
  const needed = opponents * 2 + runout;
  if (needed > candidates.length) return 0;

  let wins = 0;

  for (let round = 0; round < iterations; round += 1) {
    // Partial Fisher-Yates: only the first `needed` positions matter, so
    // there is no point shuffling all 45-odd remaining cards each iteration.
    const deck = candidates.slice();
    for (let i = 0; i < needed; i += 1) {
      const j = i + Math.floor(random() * (deck.length - i));
      const a = deck[i];
      const b = deck[j];
      if (a === undefined || b === undefined) continue;
      deck[i] = b;
      deck[j] = a;
    }

    let cursor = 0;
    const simBoard = [...board];
    for (let i = 0; i < runout; i += 1) {
      const card = deck[cursor++];
      if (card) simBoard.push(card);
    }

    const mine = evaluateHand([...holeCards, ...simBoard]);

    let better = 0;
    let equal = 0;

    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const first = deck[cursor++];
      const second = deck[cursor++];
      if (!first || !second) continue;

      const theirs = evaluateHand([first, second, ...simBoard]);
      const comparison = compareHands(theirs, mine);
      if (comparison > 0) better += 1;
      else if (comparison === 0) equal += 1;
    }

    if (better > 0) continue;
    // A split pot is worth a share, not nothing.
    wins += equal > 0 ? 1 / (equal + 1) : 1;
  }

  return wins / iterations;
}

/**
 * How many simulations to run for a given board.
 *
 * At 2000 iterations the standard error of a proportion is about 1.1%, well
 * under the granularity any betting decision needs, and the whole run takes
 * a few milliseconds — comfortably inside the bot's minimum thinking delay.
 * Fewer are needed as the board fills because variance falls.
 */
export function iterationsFor(boardLength: number): number {
  if (boardLength === 0) return 2000;
  if (boardLength === 3) return 1500;
  return 1000;
}
