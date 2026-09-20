/**
 * Seats bots at a table and watches them play, to verify the whole chain:
 * the driver schedules a turn, the policy decides, and the table advances.
 *
 *   node scripts/bot-table.mjs [hands]
 *
 * Needs the stack running (npm run docker:up) and bot accounts seeded
 * (npm run seed:bots).
 */
import { WebSocket } from 'ws';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws');
const TARGET_HANDS = Number(process.argv[2] ?? 5);

const log = (...parts) => console.log(...parts);
const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    throw new Error(`${method} ${path} → ${JSON.stringify(payload?.error ?? payload)}`);
  }
  return payload.data;
}

const stamp = Date.now();

log('1. Creating an owner account');
const owner = await call('/api/v1/auth/register', {
  method: 'POST',
  body: {
    email: `owner+${stamp}@poker.test`,
    password: 'password123',
    displayName: 'Owner',
  },
});
const token = owner.tokens.accessToken;

log('\n2. Creating a table');
const table = await call('/api/v1/tables', {
  method: 'POST',
  token,
  body: {
    name: `Bot table ${stamp}`,
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 500,
    maxBuyIn: 2000,
    isPrivate: false,
  },
});
log(`   ${table.id}`);

log('\n3. Seating four bots of different difficulty');
const difficulties = ['easy', 'medium', 'hard', 'expert'];
for (const [index, difficulty] of difficulties.entries()) {
  const state = await call(`/api/v1/tables/${table.id}/bots`, {
    method: 'POST',
    token,
    body: { seat: index, difficulty, buyIn: 1000 },
  });
  const seat = state.seats.find((entry) => entry.seat === index);
  log(`   seat ${index}: ${seat.displayName} (${difficulty})`);
}

log('\n4. Watching them play');
const socket = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}`);
await new Promise((resolve, reject) => {
  socket.on('open', resolve);
  socket.on('error', reject);
});
socket.send(JSON.stringify({ type: 'subscribe_table', tableId: table.id }));

const seen = new Set();
const actionCounts = new Map();
let lastStreet = null;
let lastHand = null;

const finished = new Promise((resolve) => {
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'table_state') return;

    const state = message.state;
    if (!state.handId) return;

    if (state.handId !== lastHand) {
      lastHand = state.handId;
      lastStreet = null;
      seen.add(state.handId);
      log(`\n   --- hand ${seen.size} ---`);
    }

    if (state.street !== lastStreet) {
      lastStreet = state.street;
      const board = state.board.join(' ') || '(no board)';
      log(`   ${state.street}: ${board}`);
    }

    const acting = state.seats.find((seat) => seat.isActing);
    if (acting) {
      const key = `${acting.displayName} (${acting.botDifficulty})`;
      actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
    }

    if (seen.size >= TARGET_HANDS && state.street === 'complete') resolve();
  });
});

const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('timed out waiting for bots to play')), 120_000),
);

try {
  await Promise.race([finished, timeout]);
} catch (error) {
  socket.close();
  fail(error.message);
}

log('\n5. Checking stacks moved');
const final = await call(`/api/v1/tables/${table.id}`, { token });
let moved = 0;
for (const seat of final.seats) {
  if (!seat.userId) continue;
  log(`   ${seat.displayName} (${seat.botDifficulty}): ${seat.stack}`);
  if (seat.stack !== 1000) moved += 1;
}

socket.close();

if (seen.size < TARGET_HANDS) fail(`only ${seen.size} hands were played`);
if (moved === 0) fail('no stack changed, so nobody actually played');

log(`\nPASSED: ${seen.size} hands dealt and played entirely by bots.`);
process.exit(0);
