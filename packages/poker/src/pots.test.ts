import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPots, splitPot } from './pots';
import { PlayerStatus, type Player, type PlayerStatusValue } from './types';

function player(
  id: string,
  totalCommitted: number,
  status: PlayerStatusValue = PlayerStatus.Active,
): Player {
  return {
    id,
    seat: Number(id.replace(/\D/g, '')) || 0,
    stack: 0,
    status,
    committed: 0,
    totalCommitted,
    holeCards: [],
  };
}

test('equal commitments make a single pot', () => {
  const pots = buildPots([player('p1', 100), player('p2', 100), player('p3', 100)]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0]?.amount, 300);
  assert.deepEqual(pots[0]?.eligiblePlayerIds, ['p1', 'p2', 'p3']);
});

test('a short all-in creates one side pot', () => {
  // p1 is all in for 50; p2 and p3 continue to 200.
  const pots = buildPots([
    player('p1', 50, PlayerStatus.AllIn),
    player('p2', 200),
    player('p3', 200),
  ]);

  assert.equal(pots.length, 2);

  assert.equal(pots[0]?.amount, 150); // 50 x 3
  assert.deepEqual(pots[0]?.eligiblePlayerIds, ['p1', 'p2', 'p3']);

  assert.equal(pots[1]?.amount, 300); // 150 x 2
  assert.deepEqual(pots[1]?.eligiblePlayerIds, ['p2', 'p3']);
});

test('two all-ins at different depths create two side pots', () => {
  const pots = buildPots([
    player('p1', 25, PlayerStatus.AllIn),
    player('p2', 75, PlayerStatus.AllIn),
    player('p3', 200),
    player('p4', 200),
  ]);

  assert.equal(pots.length, 3);

  assert.equal(pots[0]?.amount, 100); // 25 x 4
  assert.deepEqual(pots[0]?.eligiblePlayerIds, ['p1', 'p2', 'p3', 'p4']);

  assert.equal(pots[1]?.amount, 150); // 50 x 3
  assert.deepEqual(pots[1]?.eligiblePlayerIds, ['p2', 'p3', 'p4']);

  assert.equal(pots[2]?.amount, 250); // 125 x 2
  assert.deepEqual(pots[2]?.eligiblePlayerIds, ['p3', 'p4']);
});

test('folded chips stay in the pot but win nothing', () => {
  // p1 folded after committing 30; p2 and p3 went to 100.
  const pots = buildPots([
    player('p1', 30, PlayerStatus.Folded),
    player('p2', 100),
    player('p3', 100),
  ]);

  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
  assert.equal(total, 230, 'every committed chip must be in some pot');

  // Both layers (30 x 3, then 70 x 2) have the same eligible players, so they
  // merge into one pot rather than a pointless main/side split.
  assert.equal(pots.length, 1);
  assert.equal(pots[0]?.amount, 230);
  assert.deepEqual(pots[0]?.eligiblePlayerIds, ['p2', 'p3'], 'folded player is not eligible');
});

test('conserves chips in every arrangement', () => {
  const players = [
    player('p1', 17, PlayerStatus.AllIn),
    player('p2', 43, PlayerStatus.Folded),
    player('p3', 250),
    player('p4', 250),
    player('p5', 99, PlayerStatus.AllIn),
  ];

  const expected = players.reduce((sum, p) => sum + p.totalCommitted, 0);
  const actual = buildPots(players).reduce((sum, pot) => sum + pot.amount, 0);
  assert.equal(actual, expected);
});

test('no commitments means no pots', () => {
  assert.deepEqual(buildPots([player('p1', 0), player('p2', 0)]), []);
});

test('splits a pot evenly when it divides', () => {
  const payouts = splitPot(300, ['p1', 'p2', 'p3'], ['p1', 'p2', 'p3']);
  assert.equal(payouts.get('p1'), 100);
  assert.equal(payouts.get('p2'), 100);
  assert.equal(payouts.get('p3'), 100);
});

test('gives odd chips to the earliest seats', () => {
  const payouts = splitPot(100, ['p2', 'p3', 'p1'], ['p1', 'p2', 'p3']);

  const total = [...payouts.values()].reduce((sum, value) => sum + value, 0);
  assert.equal(total, 100, 'no chip may be lost');

  // 100 / 3 = 33 each, remainder 1 goes to the first seat in order.
  assert.equal(payouts.get('p1'), 34);
  assert.equal(payouts.get('p2'), 33);
  assert.equal(payouts.get('p3'), 33);
});

test('a single winner takes the whole pot', () => {
  const payouts = splitPot(137, ['p2'], ['p1', 'p2', 'p3']);
  assert.equal(payouts.get('p2'), 137);
  assert.equal(payouts.size, 1);
});
