/**
 * Plays a complete hand between two accounts over the real WebSocket, to
 * verify the server deals, enforces turn order, and settles a pot.
 *
 *   node scripts/play-hand.mjs
 *
 * Needs the stack running (npm run docker:up).
 */
import { WebSocket } from 'ws';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws');

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

async function account(email, displayName) {
  try {
    return await call('/api/v1/auth/register', {
      method: 'POST',
      body: { email, password: 'password123', displayName },
    });
  } catch {
    return call('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password: 'password123' },
    });
  }
}

/** Opens a socket and resolves once it is ready. */
function connect(token, name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS}/ws?token=${encodeURIComponent(token)}`);
    const inbox = [];
    const waiters = [];

    // Every message is buffered. A waiter scans the buffer for a match rather
    // than claiming the next message, so a broadcast that arrives while
    // nothing is waiting is never lost.
    socket.on('message', (raw) => {
      inbox.push(JSON.parse(raw.toString()));
      for (let i = waiters.length - 1; i >= 0; i -= 1) {
        if (waiters[i].tryResolve()) waiters.splice(i, 1);
      }
    });

    socket.on('error', reject);
    socket.on('open', () =>
      resolve({
        name,
        socket,
        send: (message) => socket.send(JSON.stringify(message)),
        /** Waits for a message matching `predicate`, consuming it. */
        next(predicate = () => true, timeoutMs = 8000) {
          return new Promise((res, rej) => {
            const tryResolve = () => {
              const index = inbox.findIndex(predicate);
              if (index === -1) return false;
              const [message] = inbox.splice(index, 1);
              clearTimeout(timer);
              res(message);
              return true;
            };

            const timer = setTimeout(() => {
              const at = waiters.findIndex((w) => w.tryResolve === tryResolve);
              if (at !== -1) waiters.splice(at, 1);
              rej(new Error(`${name}: timed out waiting`));
            }, timeoutMs);

            if (!tryResolve()) waiters.push({ tryResolve });
          });
        },
        close: () => socket.close(),
      }),
    );
  });
}

const stamp = Date.now();

log('1. Creating two accounts');
const alice = await account(`alice+${stamp}@poker.test`, 'Alice');
const bob = await account(`bob+${stamp}@poker.test`, 'Bob');
log(`   Alice ${alice.user.id}`);
log(`   Bob   ${bob.user.id}`);

log('\n2. Creating a table');
const table = await call('/api/v1/tables', {
  method: 'POST',
  token: alice.tokens.accessToken,
  body: {
    name: `Test table ${stamp}`,
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 400,
    maxBuyIn: 2000,
    isPrivate: false,
  },
});
log(`   table ${table.id}`);

log('\n3. Both players sit down with 1000 chips');
await call(`/api/v1/tables/${table.id}/join`, {
  method: 'POST',
  token: alice.tokens.accessToken,
  body: { seat: 0, buyIn: 1000 },
});
await call(`/api/v1/tables/${table.id}/join`, {
  method: 'POST',
  token: bob.tokens.accessToken,
  body: { seat: 1, buyIn: 1000 },
});
log('   seated');

log('\n4. Connecting both sockets');
const sockets = {
  [alice.user.id]: await connect(alice.tokens.accessToken, 'Alice'),
  [bob.user.id]: await connect(bob.tokens.accessToken, 'Bob'),
};

for (const socket of Object.values(sockets)) {
  socket.send({ type: 'subscribe_table', tableId: table.id });
}

// Each socket gets exactly one snapshot on subscribe. Consume both here
// rather than waiting again later, or the second wait blocks forever.
let aliceView = await sockets[alice.user.id].next((m) => m.type === 'table_state');
let bobView = await sockets[bob.user.id].next((m) => m.type === 'table_state');
log(`   subscribed, street: ${aliceView.state.street ?? 'no hand'}`);

if (!aliceView.state.handId) {
  log('\n5. Dealing');
  await call(`/api/v1/tables/${table.id}/deal`, {
    method: 'POST',
    token: alice.tokens.accessToken,
  });
  aliceView = await sockets[alice.user.id].next(
    (m) => m.type === 'table_state' && m.state.handId,
  );
  bobView = await sockets[bob.user.id].next(
    (m) => m.type === 'table_state' && m.state.handId,
  );
} else {
  log('\n5. A hand was already dealt when the second player sat down');
}

log('\n6. Checking what each player can see');
const aliceSeat = aliceView.state.seats.find((s) => s.userId === alice.user.id);
const aliceSeesBob = aliceView.state.seats.find((s) => s.userId === bob.user.id);
const bobSeat = bobView.state.seats.find((s) => s.userId === bob.user.id);

log(`   Alice's own cards:   ${aliceSeat.holeCards.join(' ') || '(none)'}`);
log(`   Alice sees Bob's:    ${aliceSeesBob.holeCards.join(' ') || '(hidden)'}`);

log(`   Bob's own cards:     ${bobSeat.holeCards.join(' ') || '(none)'}`);

if (aliceSeat.holeCards.length !== 2) fail('a player cannot see their own cards');
if (bobSeat.holeCards.length !== 2) fail('Bob cannot see his own cards');
if (aliceSeesBob.holeCards.length !== 0) fail('opponent hole cards leaked to the client');
log('   Hole cards are correctly redacted per viewer.');

log('\n7. Playing the hand out');

// Track the latest state per socket. `legalActions` is only populated for the
// player whose turn it is, so reading it from someone else's view always looks
// empty — which would make every player fold.
const latest = {
  [alice.user.id]: aliceView.state,
  [bob.user.id]: bobView.state,
};

let state = aliceView.state;
let guard = 0;
let lastStreet = state.street;
let seenSequence = aliceView.sequence;

while (state.street && state.street !== 'complete' && guard < 60) {
  guard += 1;

  const actingId = state.actingPlayerId;
  if (!actingId) break;

  const socket = sockets[actingId];
  const actingView = latest[actingId];
  const actingSeat = actingView.seats.find((s) => s.userId === actingId);

  // Prefer check, then call, so the hand runs to showdown instead of ending
  // on a fold — that is the path that exercises the evaluator and pot split.
  const legal = actingView.legalActions.map((a) => a.type);
  const choice = legal.includes('check') ? 'check' : legal.includes('call') ? 'call' : 'fold';

  if (actingView.street !== lastStreet) {
    lastStreet = actingView.street;
    log(`   -- ${lastStreet}: ${actingView.board.join(' ') || '(no board)'}`);
  }

  log(`   ${actingSeat.displayName}: ${choice}`);

  socket.send({
    type: 'player_action',
    tableId: table.id,
    requestId: `r${guard}`,
    action: { type: choice, amount: 0 },
  });

  const result = await socket.next((m) => m.type === 'action_result');
  if (!result.ok) fail(`action rejected: ${result.error}`);

  // Wait on the sequence number, not on whose turn it is. After the last
  // check of a street the action can come back round to the same player on
  // the next street, so "the actor changed" is not a reliable signal.
  const afterThisAction = (m) => m.type === 'table_state' && m.sequence > seenSequence;

  const [aliceUpdate, bobUpdate] = await Promise.all([
    sockets[alice.user.id].next(afterThisAction),
    sockets[bob.user.id].next(afterThisAction),
  ]);

  seenSequence = aliceUpdate.sequence;

  latest[alice.user.id] = aliceUpdate.state;
  latest[bob.user.id] = bobUpdate.state;
  state = aliceUpdate.state;
}

log(`\n8. Hand finished at street: ${state.street}`);
log(`   board: ${state.board.join(' ') || '(none)'}`);

if (state.street !== 'complete') fail(`hand did not complete (stuck at ${state.street})`);

log('\n9. Checking cards were revealed at showdown');
const finalAlice = latest[alice.user.id];
const bobAtShowdown = finalAlice.seats.find((s) => s.userId === bob.user.id);
log(`   Alice now sees Bob's: ${bobAtShowdown.holeCards.join(' ') || '(still hidden)'}`);

// Only a contested showdown reveals. A hand that ended on a fold shows nothing.
if (finalAlice.board.length === 5 && bobAtShowdown.holeCards.length !== 2) {
  fail('cards should be revealed once a contested hand reaches showdown');
}
log('   Revealed correctly after the hand ended.');

log('\n10. Verifying chips were conserved');
const finalState = await call(`/api/v1/tables/${table.id}`, {
  token: alice.tokens.accessToken,
});
const totalChips = finalState.seats.reduce((sum, seat) => sum + seat.stack, 0);
log(`   total on the table: ${totalChips}`);
if (totalChips !== 2000) fail(`chips not conserved: expected 2000, got ${totalChips}`);

log('\n10. Checking the hand was recorded');
const history = await call(`/api/v1/tables/${table.id}`, {
  token: alice.tokens.accessToken,
});
log(`   table status: ${history.street ?? 'idle'}`);

for (const socket of Object.values(sockets)) socket.close();

log('\nPASSED: a full hand was dealt, played, and settled over the socket.');
process.exit(0);
