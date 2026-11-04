import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from '../cards';
import { seededRandom } from '../test-helpers';
import { equity, iterationsFor } from './monte-carlo';

/**
 * These check the simulation is *correct*, not merely self-consistent.
 *
 * The expected values are published heads-up equities, so a bug that made
 * every hand look equally strong would fail here even though the numbers
 * would still be internally consistent.
 */

const ITERATIONS = 20_000;
const TOLERANCE = 0.03;

function near(actual: number, expected: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${label}: expected ~${expected}, got ${actual.toFixed(3)}`,
  );
}

test('pocket aces against one random opponent is about 85 percent', () => {
  const result = equity({
    holeCards: ['As', 'Ad'] as Card[],
    board: [],
    opponents: 1,
    iterations: ITERATIONS,
    random: seededRandom(11),
  });
  near(result, 0.85, 'AA vs random');
});

test('seven-deuce offsuit against one random opponent is about 35 percent', () => {
  const result = equity({
    holeCards: ['7c', '2d'] as Card[],
    board: [],
    opponents: 1,
    iterations: ITERATIONS,
    random: seededRandom(12),
  });
  near(result, 0.35, '72o vs random');
});

test('equity falls as opponents are added', () => {
  const heads = equity({
    holeCards: ['As', 'Ad'] as Card[],
    board: [],
    opponents: 1,
    iterations: ITERATIONS,
    random: seededRandom(13),
  });
  const fiveWay = equity({
    holeCards: ['As', 'Ad'] as Card[],
    board: [],
    opponents: 4,
    iterations: ITERATIONS,
    random: seededRandom(14),
  });

  assert.ok(heads > fiveWay, 'aces are worth less against more players');
  assert.ok(fiveWay > 0.4, `aces five-handed should still be favourite, got ${fiveWay}`);
});

test('a made flush on the flop is a heavy favourite', () => {
  const result = equity({
    holeCards: ['As', 'Ks'] as Card[],
    board: ['Qs', '7s', '2s'] as Card[],
    opponents: 1,
    iterations: ITERATIONS,
    random: seededRandom(15),
  });
  assert.ok(result > 0.9, `nut flush should be over 90 percent, got ${result.toFixed(3)}`);
});

test('a hand drawing dead has no equity', () => {
  // Opponent cannot be beaten: the board is a royal flush, so every hand
  // ties. Ties count as a share, so equity is 0.5 heads-up.
  const result = equity({
    holeCards: ['2c', '3d'] as Card[],
    board: ['As', 'Ks', 'Qs', 'Js', 'Ts'] as Card[],
    opponents: 1,
    iterations: 2000,
    random: seededRandom(16),
  });
  near(result, 0.5, 'board plays, so the pot splits');
});

test('the simulation is deterministic for a fixed seed', () => {
  const first = equity({
    holeCards: ['Jh', 'Jd'] as Card[],
    board: [],
    opponents: 2,
    iterations: 500,
    random: seededRandom(77),
  });
  const second = equity({
    holeCards: ['Jh', 'Jd'] as Card[],
    board: [],
    opponents: 2,
    iterations: 500,
    random: seededRandom(77),
  });

  assert.equal(first, second, 'same seed must give the same answer');
});

test('iteration counts fall as the board fills', () => {
  assert.ok(iterationsFor(0) > iterationsFor(3));
  assert.ok(iterationsFor(3) >= iterationsFor(5));
});
