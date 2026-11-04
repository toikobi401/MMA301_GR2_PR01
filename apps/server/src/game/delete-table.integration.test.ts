import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { Socket } from 'node:net';
import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { ServerMessage, UserRole } from '@app/shared';

// Run against a separate replica-set database whose name ends in _test.
const enabled = new URL(process.env.DATABASE_URL ?? 'mongodb://localhost/poker').pathname.endsWith('_test');
let app: FastifyInstance;
const tableIds: ObjectId[] = [];
const userIds: ObjectId[] = [];
const database = enabled ? await import('../lib/db.js') : null;
const registry = enabled ? await import('./registry.js') : null;

before(async () => {
  if (!database) return;
  await database.connectDatabase();
  // Create collections before transactions, including on a fresh test database.
  for (const name of ['users', 'pokerTables', 'chipTransactions', 'hands', 'playerStats']) {
    if (!(await database.db().listCollections({ name }).hasNext())) await database.db().createCollection(name);
  }
  app = await (await import('../app.js')).buildApp();
  await app.ready();
});

after(async () => {
  if (!database || !registry) return;
  registry.disposeAllTables();
  await app?.close();
  await database.pokerTables().deleteMany({ _id: { $in: tableIds } });
  await database.hands().deleteMany({ tableId: { $in: tableIds } });
  await database.chipTransactions().deleteMany({ userId: { $in: userIds } });
  await database.playerStats().deleteMany({ userId: { $in: userIds } });
  await database.users().deleteMany({ _id: { $in: userIds } });
  await database.closeDatabase();
});

function auth(role: UserRole = 'admin', id = new ObjectId()) {
  return { authorization: `Bearer ${app.jwt.sign({ sub: id.toHexString(), role })}` };
}

async function user(chips = 9000, isBot = false, id = new ObjectId()) {
  userIds.push(id);
  await database!.users().insertOne({
    _id: id, email: `${id}@delete-test.local`, displayName: 'Deletion test',
    passwordHash: 'not-used', role: 'user', chips, isBot, createdAt: new Date(),
  });
  return id;
}

async function fixture(seats: { id: ObjectId; stack: number; bot?: boolean }[] = [], isPrivate = false) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/tables', headers: auth(), payload: {
    name: 'Deletion test', maxSeats: 6, smallBlind: 10, bigBlind: 20,
    minBuyIn: 100, maxBuyIn: 10_000, isPrivate,
  } });
  assert.equal(response.statusCode, 201, response.body);
  const id = new ObjectId(response.json().data.id);
  tableIds.push(id);
  for (const [seat, entry] of seats.entries()) {
    await database!.pokerTables().updateOne({ _id: id, 'seats.seat': seat }, { $set: {
      'seats.$.userId': entry.id, 'seats.$.stack': entry.stack,
      'seats.$.displayName': 'Deletion test',
      'seats.$.botProfile': entry.bot ? { difficulty: 'easy' } : null,
    } });
  }
  return id.toHexString();
}

function remove(id: string, headers: Record<string, string> = auth()) {
  return app.inject({ method: 'DELETE', url: `/api/v1/tables/${id}`, headers });
}

test('only admins may delete, and admin lists include private tables owned by others', { skip: !enabled }, async () => {
  const id = await fixture([], true);
  assert.equal((await remove(id, {})).statusCode, 401);
  assert.equal((await remove(id, auth('user'))).statusCode, 403);
  assert.equal((await remove(id, auth('moderator'))).statusCode, 403);
  const list = await app.inject({ method: 'GET', url: '/api/v1/tables', headers: auth() });
  assert.ok(list.json().data.items.some((table: { id: string }) => table.id === id));
  assert.equal((await remove(id)).statusCode, 200);
});

test('live deletion refunds pre-deal human stacks once, excludes bots, evicts sockets and cancels the pot', { skip: !enabled }, async () => {
  const a = await user(9500), b = await user(9300), bot = await user(0, true);
  const id = await fixture([{ id: a, stack: 500 }, { id: b, stack: 700 }, { id: bot, stack: 900, bot: true }]);
  const table = await registry!.getTable(id);
  table.startHandIfReady();
  table.act(table.currentHand!.actingPlayerId!, 'call', 0);
  const transport = new Socket();
  Object.defineProperty(transport, 'remoteAddress', { value: '127.0.0.1' });
  const socket = await app.injectWS(`/ws?token=${app.jwt.sign({ sub: a.toHexString(), role: 'user' })}`, { socket: transport });
  const state = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'subscribe_table', tableId: id.toUpperCase() }));
  await state;
  const evicted = once(socket, 'message');
  const results = await Promise.all([remove(id), remove(id)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 404]);
  const [raw] = await evicted;
  assert.equal((JSON.parse(String(raw)) as ServerMessage).type, 'table_deleted');
  socket.terminate();
  for (const peer of app.websocketServer.clients) peer.terminate();
  transport.destroy();
  assert.equal((await database!.users().findOne({ _id: a }))!.chips, 10_000);
  assert.equal((await database!.users().findOne({ _id: b }))!.chips, 10_000);
  assert.equal((await database!.users().findOne({ _id: bot }))!.chips, 0);
  assert.equal(await database!.chipTransactions().countDocuments({ userId: { $in: [a, b] } }), 2);
  assert.equal(await database!.hands().countDocuments({ tableId: new ObjectId(id) }), 0);
  assert.equal(registry!.peekTable(id), undefined);
  assert.equal(await database!.pokerTables().countDocuments({ _id: new ObjectId(id) }), 0);
});

test('a failed refund rolls back deletion and all credits; retry succeeds once the account is restored', { skip: !enabled }, async () => {
  const a = await user(9500), missing = new ObjectId();
  const id = await fixture([{ id: a, stack: 500 }, { id: missing, stack: 700 }]);
  assert.equal((await remove(id)).statusCode, 409);
  assert.equal((await database!.users().findOne({ _id: a }))!.chips, 9500);
  assert.equal(await database!.chipTransactions().countDocuments({ userId: a }), 0);
  assert.equal(await database!.pokerTables().countDocuments({ _id: new ObjectId(id) }), 1);
  await user(9300, false, missing);
  assert.equal((await remove(id)).statusCode, 200);
  assert.equal((await database!.users().findOne({ _id: a }))!.chips, 10_000);
});

test('deletion waits for a departing player settlement and retains the completed hand history', { skip: !enabled }, async () => {
  const a = await user(9000), b = await user(9000);
  const id = await fixture([{ id: a, stack: 1000 }, { id: b, stack: 1000 }]);
  const table = await registry!.getTable(id);
  table.startHandIfReady();
  const actor = table.currentHand!.actingPlayerId!;
  const leave = await app.inject({ method: 'POST', url: `/api/v1/tables/${id}/leave`, headers: auth('user', new ObjectId(actor)) });
  assert.equal(leave.statusCode, 200, leave.body);
  assert.equal((await remove(id)).statusCode, 200);
  const balances = await database!.users().find({ _id: { $in: [a, b] } }).toArray();
  assert.deepEqual(balances.map(row => row.chips).sort((a, b) => a - b), [9990, 10010]);
  assert.equal(await database!.chipTransactions().countDocuments({ userId: { $in: [a, b] } }), 2);
  const history = await app.inject({ method: 'GET', url: '/api/v1/hands', headers: auth('user', a) });
  assert.ok(history.json().data.items.some((hand: { tableId: string }) => hand.tableId === id));
});

test('a join racing with deletion cannot strand or duplicate chips', { skip: !enabled }, async () => {
  const a = await user(10_000);
  const id = await fixture();
  const [joined, deleted] = await Promise.all([
    app.inject({ method: 'POST', url: `/api/v1/tables/${id}/join`, headers: auth('user', a), payload: { buyIn: 500 } }),
    remove(id),
  ]);
  assert.ok([200, 404].includes(joined.statusCode), joined.body);
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal((await database!.users().findOne({ _id: a }))!.chips, 10_000);
  assert.equal(await database!.pokerTables().countDocuments({ _id: new ObjectId(id) }), 0);
});
