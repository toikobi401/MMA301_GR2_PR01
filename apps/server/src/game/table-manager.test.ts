import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { ObjectId } from 'mongodb';
import { ACTION_TIMEOUT_SECONDS } from '@app/shared';
import type { PokerTableDoc } from '../lib/db.js';

// Config is validated on import, and nothing below reaches the database.
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_32_characters';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_32_characters';
const { Table } = await import('./table-manager.js');

function tableWith(playerIds: ObjectId[], autoDeal = false) {
  return new Table({
    _id: new ObjectId(),
    smallBlind: 10,
    bigBlind: 20,
    handNumber: 0,
    buttonSeat: 0,
    autoDeal,
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

test('a table that runs itself deals again when an away player returns', () => {
  const [back, other] = [new ObjectId(), new ObjectId()];
  const table = tableWith([back, other], true);

  table.playerDisconnected(back.toHexString());
  assert.equal(table.startHandIfReady(), false);

  table.playerConnected(back.toHexString());
  assert.equal(table.currentHand?.players.length, 2);
  table.dispose();
});

test('a table of humans does not deal just because someone returned', () => {
  const [back, other] = [new ObjectId(), new ObjectId()];
  const table = tableWith([back, other]);

  table.playerDisconnected(back.toHexString());
  table.playerConnected(back.toHexString());

  assert.equal(table.currentHand, null);
  table.dispose();
});

test('only a player with no socket is marked away when their clock runs out', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ids = [new ObjectId(), new ObjectId(), new ObjectId(), new ObjectId()];
    const table = tableWith(ids);
    const away = Reflect.get(table, 'away') as Set<string>;
    table.startHandIfReady();

    // Connected but idle: folded by the clock, keeps their place at the table.
    const idle = table.currentHand?.actingPlayerId as string;
    table.playerConnected(idle);
    mock.timers.tick(ACTION_TIMEOUT_SECONDS * 1000);
    assert.notEqual(table.currentHand?.actingPlayerId, idle);
    assert.equal(away.has(idle), false);

    // No socket at all: they will not be dealt the next hand.
    const offline = table.currentHand?.actingPlayerId as string;
    mock.timers.tick(ACTION_TIMEOUT_SECONDS * 1000);
    assert.equal(away.has(offline), true);
    table.dispose();
  } finally {
    mock.timers.reset();
  }
});
