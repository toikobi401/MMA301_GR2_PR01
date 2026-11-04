import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrangeSeats, dealPosition } from './seat-layout';

const seats = (count: number) => Array.from({ length: count }, (_, seat) => ({ seat }));
const numbers = (list: { seat: number }[]) => list.map((entry) => entry.seat);

test('six seats read clockwise from the viewer, with no one skipped', () => {
  const layout = arrangeSeats(seats(6), 2);

  assert.deepEqual(numbers(layout.bottomLeft), [3]);
  assert.deepEqual(numbers(layout.top), [4, 5, 0]);
  assert.deepEqual(numbers(layout.bottomRight), [1]);
});

test('bottom rows are written outermost first on the left, innermost first on the right', () => {
  const layout = arrangeSeats(seats(9), 0);

  assert.deepEqual(numbers(layout.bottomLeft), [2, 1]);
  assert.deepEqual(numbers(layout.top), [3, 4, 5, 6]);
  assert.deepEqual(numbers(layout.bottomRight), [8, 7]);
});

test('heads-up puts the opponent across the table', () => {
  const layout = arrangeSeats(seats(2), 1);

  assert.deepEqual(numbers(layout.top), [0]);
  assert.deepEqual(numbers(layout.bottomLeft), []);
});

test('a spectator sees every seat', () => {
  const layout = arrangeSeats(seats(6), null);
  const shown = [...layout.bottomLeft, ...layout.top, ...layout.bottomRight];

  assert.equal(shown.length, 6);
});

test('the deal starts left of the button and wraps', () => {
  assert.equal(dealPosition(3, [0, 1, 3], 1), 0);
  assert.equal(dealPosition(0, [0, 1, 3], 1), 1);
  assert.equal(dealPosition(1, [0, 1, 3], 1), 2);
});
