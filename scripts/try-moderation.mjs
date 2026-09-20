/**
 * Exercises tournament control end to end against the running server.
 *
 *   node scripts/try-moderation.mjs
 *
 * Needs the stack up and an admin account:
 *   npm run make:moderator -- <email> admin
 */

const API = process.env.API_URL ?? 'http://localhost:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'alice.ui@poker.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123';

let failures = 0;

const log = (...parts) => console.log(...parts);
const pass = (label) => log(`  ✓ ${label}`);
const fail = (label, detail) => {
  failures += 1;
  log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
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
  return { status: response.status, payload };
}

async function expectOk(label, path, options) {
  const { status, payload } = await call(path, options);
  if (payload?.ok) {
    pass(label);
    return payload.data;
  }
  fail(label, `HTTP ${status} ${JSON.stringify(payload?.error ?? payload)}`);
  return null;
}

async function expectRefused(label, path, options, expectedCode) {
  const { status, payload } = await call(path, options);
  if (payload?.ok) {
    fail(label, 'the request was allowed');
    return;
  }
  const code = payload?.error?.code;
  if (expectedCode && code !== expectedCode) {
    fail(label, `expected ${expectedCode}, got ${code} (HTTP ${status})`);
    return;
  }
  pass(`${label} — ${code}`);
}

const stamp = Date.now();

log('\n1. Signing in as the moderator');
const adminLogin = await call('/api/v1/auth/login', {
  method: 'POST',
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});

if (!adminLogin.payload?.ok) {
  console.error(
    `Could not sign in as ${ADMIN_EMAIL}. Run: npm run make:moderator -- ${ADMIN_EMAIL} admin`,
  );
  process.exit(1);
}

const adminToken = adminLogin.payload.data.tokens.accessToken;
log(`   ${adminLogin.payload.data.user.displayName} (${adminLogin.payload.data.user.role})`);

log('\n2. Creating an ordinary player');
const player = await call('/api/v1/auth/register', {
  method: 'POST',
  body: {
    email: `victim+${stamp}@poker.test`,
    password: 'password123',
    displayName: 'Victim',
  },
});
const playerToken = player.payload.data.tokens.accessToken;
const playerId = player.payload.data.user.id;
const playerRefresh = player.payload.data.tokens.refreshToken;
log(`   ${playerId}`);

log('\n3. Players can no longer open tables');
await expectRefused(
  'POST /tables is gone for players',
  '/api/v1/tables',
  {
    method: 'POST',
    token: playerToken,
    body: {
      name: 'Should not exist',
      maxSeats: 6,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 400,
      maxBuyIn: 2000,
      isPrivate: false,
    },
  },
  'NOT_FOUND',
);

log('\n4. A player cannot reach moderation');
await expectRefused(
  'moderation is closed to players',
  '/api/v1/moderation/tables',
  { token: playerToken },
  'FORBIDDEN',
);

log('\n5. The moderator opens a table');
const table = await expectOk('table created', '/api/v1/moderation/tables', {
  method: 'POST',
  token: adminToken,
  body: {
    name: `Tournament ${stamp}`,
    maxSeats: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 400,
    maxBuyIn: 2000,
    isPrivate: false,
  },
});

if (!table) process.exit(1);

log('\n6. The player joins it');
await expectOk('player seated', `/api/v1/tables/${table.id}/join`, {
  method: 'POST',
  token: playerToken,
  body: { seat: 0, buyIn: 1000 },
});

log('\n7. The moderator sees the table and who is on it');
const managed = await expectOk('table list', '/api/v1/moderation/tables', {
  token: adminToken,
});
const listed = managed?.items.find((entry) => entry.id === table.id);
if (listed?.seatedPlayers.length === 1) pass(`one player seated: ${listed.seatedPlayers[0].displayName}`);
else fail('seated players reported', JSON.stringify(listed?.seatedPlayers));

log('\n8. Banning the player');
await expectOk('ban applied', `/api/v1/moderation/users/${playerId}/ban`, {
  method: 'POST',
  token: adminToken,
  body: { reason: 'Testing the ban path' },
});

log('\n9. The ban actually takes effect');
await expectRefused(
  'banned account cannot sign in',
  '/api/v1/auth/login',
  { method: 'POST', body: { email: `victim+${stamp}@poker.test`, password: 'password123' } },
  'FORBIDDEN',
);

await expectRefused(
  'the old refresh token is dead',
  '/api/v1/auth/refresh',
  { method: 'POST', body: { refreshToken: playerRefresh } },
  'UNAUTHORIZED',
);

log('\n10. Lifting the ban restores the account');
await expectOk('ban lifted', `/api/v1/moderation/users/${playerId}/ban`, {
  method: 'DELETE',
  token: adminToken,
});

const back = await call('/api/v1/auth/login', {
  method: 'POST',
  body: { email: `victim+${stamp}@poker.test`, password: 'password123' },
});
if (back.payload?.ok) {
  pass(`signs in again with ${back.payload.data.user.displayName}'s chips intact`);
} else {
  fail('sign in after unban', JSON.stringify(back.payload?.error));
}

log('\n11. Chips survived the ban');
const wallet = await call('/api/v1/wallet', {
  token: back.payload?.data?.tokens?.accessToken,
});
if (wallet.payload?.ok && wallet.payload.data.chips > 0) {
  pass(`balance is ${wallet.payload.data.chips}`);
} else {
  fail('wallet after unban', JSON.stringify(wallet.payload));
}

log('\n12. Closing the table');
await expectOk('table closed', `/api/v1/moderation/tables/${table.id}`, {
  method: 'DELETE',
  token: adminToken,
  body: { reason: 'Test finished' },
});

const afterClose = await call('/api/v1/tables', { token: adminToken });
const stillListed = afterClose.payload?.data?.items?.some((entry) => entry.id === table.id);
if (stillListed) fail('closed table is hidden from the lobby');
else pass('closed table no longer appears in the lobby');

log('\n13. Only an admin can change a role');
const modOnly = await call(`/api/v1/moderation/users/${playerId}/role`, {
  method: 'PUT',
  token: playerToken,
  body: { role: 'admin' },
});
if (modOnly.payload?.ok) fail('a player promoted themselves');
else pass(`self-promotion refused — ${modOnly.payload?.error?.code}`);

log(
  failures === 0
    ? '\nPASSED: tournament control works end to end.'
    : `\nFAILED: ${failures} check(s) did not pass.`,
);
process.exit(failures === 0 ? 0 : 1);
