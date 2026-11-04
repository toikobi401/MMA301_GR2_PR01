import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { ObjectId } from 'mongodb';
import { ACTION_TIMEOUT_SECONDS, TIME_BANK_SECONDS } from '@app/shared';
import type { PokerTableDoc } from '../lib/db.js';

// Config is validated on import, and nothing below reaches the database.
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_32_characters';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_32_characters';
const { Table } = await import('./table-manager.js');

function tableWith(playerIds: ObjectId[]) {
  return new Table({
    _id: new ObjectId(),
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 100,
    maxBuyIn: 10_000,
    handNumber: 0,
    buttonSeat: 0,
    status: 'open',
    seats: playerIds.map((userId, seat) => ({
      seat,
      userId,
      displayName: `p${seat}`,
      stack: 1000,
      botProfile: null,
      joinedAt: new Date(),
    })),
  } as unknown as PokerTableDoc);
}

test('a seated player who disconnected is not dealt in', () => {
  const [gone, a, b] = [new ObjectId(), new ObjectId(), new ObjectId()];
  const table = tableWith([gone, a, b]);

  table.playerConnected(gone.toHexString());
  table.playerDisconnected(gone.toHexString());

  assert.equal(table.startHandIfReady(), true);
  const dealt = table.currentHand?.players.map((player) => player.id);
  assert.deepEqual(dealt, [a.toHexString(), b.toHexString()]);
  table.dispose();
});

test('a player who never opened a socket is still dealt in', () => {
  // Joining happens over REST before the socket opens, so this must not count
  // as being away.
  const [a, b] = [new ObjectId(), new ObjectId()];
  const table = tableWith([a, b]);

  assert.equal(table.startHandIfReady(), true);
  assert.equal(table.currentHand?.players.length, 2);
  table.dispose();
});

test('the table deals by itself once someone is watching', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const [back, other] = [new ObjectId(), new ObjectId()];
    const table = tableWith([back, other]);

    table.playerDisconnected(back.toHexString());
    assert.equal(table.startHandIfReady(), false, 'one player is at the table');

    table.playerConnected(back.toHexString());
    assert.equal(table.seq >= 0 && table.currentHand === null, true, 'gives the client time');

    mock.timers.tick(2000);
    assert.equal(table.currentHand?.players.length, 2);
    table.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('nothing is dealt with nobody watching', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const table = tableWith([new ObjectId(), new ObjectId()]);

    table.seatChanged();
    mock.timers.tick(2000);

    assert.equal(table.currentHand, null);
    table.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('a newcomer waits for the big blind while others play', () => {
  const [a, b, newcomer] = [new ObjectId(), new ObjectId(), new ObjectId()];
  // Button moves to seat 1. Seat 2, the newcomer, is next but that spot is the
  // small blind, which they skip, so the established pair play heads-up.
  const table = tableWith([a, b, newcomer]);
  table.seatTaken(newcomer.toHexString());

  table.startHandIfReady();

  const dealt = table.currentHand?.players.map((player) => player.id);
  assert.deepEqual(dealt, [a.toHexString(), b.toHexString()]);
  assert.equal(
    table.viewFor(null).seats[2]?.waitingForBigBlind,
    true,
    'the table shows why they have no cards',
  );
  table.dispose();
});

test('a newcomer plays when the big blind lands on them', () => {
  const [a, b, newcomer] = [new ObjectId(), new ObjectId(), new ObjectId()];
  const table = tableWith([a, b, newcomer]);
  table.table.buttonSeat = 1;
  table.seatTaken(newcomer.toHexString());

  // Button to seat 0, small blind seat 1, big blind seat 2.
  table.startHandIfReady();

  assert.equal(table.currentHand?.players.length, 3);
  assert.equal(table.viewFor(null).seats[2]?.waitingForBigBlind, false);
  table.dispose();
});

test('with no game to wait for, a newcomer plays immediately', () => {
  const [a, newcomer] = [new ObjectId(), new ObjectId()];
  const table = tableWith([a, newcomer]);
  table.seatTaken(newcomer.toHexString());

  assert.equal(table.startHandIfReady(), true);
  assert.equal(table.currentHand?.players.length, 2);
  table.dispose();
});

test('sitting out skips the deal, and missing a hand means waiting to return', () => {
  const [out, a, b] = [new ObjectId(), new ObjectId(), new ObjectId()];
  const table = tableWith([out, a, b]);
  table.setSittingOut(out.toHexString(), true);

  table.startHandIfReady();
  assert.equal(table.currentHand?.players.length, 2);

  table.setSittingOut(out.toHexString(), false);
  assert.equal(table.viewFor(null).seats[0]?.waitingForBigBlind, true);
  table.dispose();
});

test('leaving mid-hand folds the player and holds the payout until it ends', () => {
  const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
  const table = tableWith(ids);
  table.startHandIfReady();

  const notActing = table.currentHand?.players.find(
    (player) => player.id !== table.currentHand?.actingPlayerId,
  )?.id as string;

  assert.equal(table.leave(notActing), null);

  const player = table.currentHand?.players.find((entry) => entry.id === notActing);
  assert.equal(player?.status, 'folded');
  assert.ok(table.table.seats.some((seat) => seat.userId?.toHexString() === notActing));
  table.dispose();
});

test('a player who left with chips must come back with at least that many', () => {
  const [rich, other] = [new ObjectId(), new ObjectId()];
  const table = tableWith([rich, other]);
  const seat = table.table.seats[0];
  if (seat) seat.stack = 3000;
  table.table.maxBuyIn = 2500;
  table.table.minBuyIn = 100;

  assert.equal(table.leave(rich.toHexString()), 3000);
  assert.equal(table.minBuyInFor(rich.toHexString()), 2500, 'capped at the table maximum');
  assert.equal(table.minBuyInFor(other.toHexString()), 100);
  table.dispose();
});

test('the clock gives a connected player their time bank, and no one else', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ids = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
    const table = tableWith(ids);
    const away = Reflect.get(table, 'away') as Set<string>;
    table.startHandIfReady();

    // Connected but idle: the reserve first, and they keep the turn.
    const idle = table.currentHand?.actingPlayerId as string;
    table.playerConnected(idle);
    mock.timers.tick(ACTION_TIMEOUT_SECONDS * 1000);
    assert.equal(table.currentHand?.actingPlayerId, idle);
    assert.equal(table.viewFor(null).actingOnTimeBank, true);

    mock.timers.tick(TIME_BANK_SECONDS * 1000);
    assert.notEqual(table.currentHand?.actingPlayerId, idle);
    assert.equal(away.has(idle), false, 'still at the table');

    // No socket at all: no reserve, and they are not dealt the next hand.
    const offline = table.currentHand?.actingPlayerId as string;
    mock.timers.tick(ACTION_TIMEOUT_SECONDS * 1000);
    assert.notEqual(table.currentHand?.actingPlayerId, offline);
    assert.equal(away.has(offline), true);
    table.dispose();
  } finally {
    mock.timers.reset();
  }
});
