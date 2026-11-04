import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from './cards';
import { compareHands, evaluateHand, HandCategory } from './evaluator';

const hand = (...cards: string[]) => evaluateHand(cards as Card[]);

test('classifies each category correctly', () => {
  assert.equal(hand('As', 'Ks', 'Qs', 'Js', 'Ts').category, HandCategory.StraightFlush);
  assert.equal(hand('9c', '9d', '9h', '9s', '2c').category, HandCategory.FourOfAKind);
  assert.equal(hand('9c', '9d', '9h', '2s', '2c').category, HandCategory.FullHouse);
  assert.equal(hand('As', '9s', '7s', '4s', '2s').category, HandCategory.Flush);
  assert.equal(hand('9c', '8d', '7h', '6s', '5c').category, HandCategory.Straight);
  assert.equal(hand('9c', '9d', '9h', '4s', '2c').category, HandCategory.ThreeOfAKind);
  assert.equal(hand('9c', '9d', '4h', '4s', '2c').category, HandCategory.TwoPair);
  assert.equal(hand('9c', '9d', '7h', '4s', '2c').category, HandCategory.Pair);
  assert.equal(hand('Ac', '9d', '7h', '4s', '2c').category, HandCategory.HighCard);
});

test('the wheel is a five-high straight, not ace-high', () => {
  const wheel = hand('Ac', '2d', '3h', '4s', '5c');
  assert.equal(wheel.category, HandCategory.Straight);
  // Top card is the five (rank value 3), not the ace (12).
  assert.deepEqual(wheel.tiebreakers, [3]);

  // A six-high straight must beat the wheel.
  const sixHigh = hand('2c', '3d', '4h', '5s', '6c');
  assert.ok(compareHands(sixHigh, wheel) > 0);
});

test('steel wheel is a straight flush ranked by its five', () => {
  const steelWheel = hand('As', '2s', '3s', '4s', '5s');
  assert.equal(steelWheel.category, HandCategory.StraightFlush);
  assert.deepEqual(steelWheel.tiebreakers, [3]);

  const sixHighSF = hand('2s', '3s', '4s', '5s', '6s');
  assert.ok(compareHands(sixHighSF, steelWheel) > 0);
});

test('picks the best five from seven cards', () => {
  // Board pairs the board; the player holds the nut flush.
  const value = hand('As', 'Ks', '7s', '4s', '2s', '9d', '9h');
  assert.equal(value.category, HandCategory.Flush);
  assert.equal(value.cards.length, 5);
  assert.ok(value.cards.every((card) => card.endsWith('s')));
});

test('a flush beats a straight', () => {
  const flush = hand('2s', '5s', '9s', 'Js', 'Ks');
  const straight = hand('9c', 'Td', 'Jh', 'Qs', 'Kc');
  assert.ok(compareHands(flush, straight) > 0);
});

test('a full house beats a flush', () => {
  const fullHouse = hand('9c', '9d', '9h', '2s', '2c');
  const flush = hand('As', 'Qs', '9s', '5s', '3s');
  assert.ok(compareHands(fullHouse, flush) > 0);
});

test('compares kickers when the made hand ties', () => {
  const aceKicker = hand('Kc', 'Kd', 'As', '7h', '3c');
  const queenKicker = hand('Kh', 'Ks', 'Qd', '7c', '3h');
  assert.ok(compareHands(aceKicker, queenKicker) > 0);
});

test('identical hands of different suits tie exactly', () => {
  const a = hand('Ac', 'Kd', 'Qh', 'Js', '9c');
  const b = hand('Ad', 'Kh', 'Qs', 'Jc', '9d');
  assert.equal(compareHands(a, b), 0);
});

test('two pair compares high pair, then low pair, then kicker', () => {
  const acesAndTwos = hand('Ac', 'Ad', '2h', '2s', '9c');
  const kingsAndQueens = hand('Kc', 'Kd', 'Qh', 'Qs', '9c');
  assert.ok(compareHands(acesAndTwos, kingsAndQueens) > 0);

  const betterKicker = hand('Ac', 'Ad', '2h', '2s', 'Kc');
  assert.ok(compareHands(betterKicker, acesAndTwos) > 0);
});

test('does not read a straight across a gap', () => {
  const value = hand('2c', '3d', '4h', '5s', '7c');
  assert.equal(value.category, HandCategory.HighCard);
});

test('four of a kind on the board uses the highest kicker', () => {
  const value = hand('9c', '9d', '9h', '9s', 'Kc', '2d', '3h');
  assert.equal(value.category, HandCategory.FourOfAKind);
  // Kicker is the king (11), not the three.
  assert.deepEqual(value.tiebreakers, [7, 11]);
});

test('full house picks the highest trips and the highest pair', () => {
  // Trip nines and trip twos plus a pair of kings: nines full of kings.
  const value = hand('9c', '9d', '9h', '2s', '2c', 'Kd', 'Kh');
  assert.equal(value.category, HandCategory.FullHouse);
  assert.deepEqual(value.tiebreakers, [7, 11]);
});

test('rejects fewer than five cards', () => {
  assert.throws(() => hand('Ac', 'Kd', 'Qh', 'Js'), /at least 5 cards/);
});
