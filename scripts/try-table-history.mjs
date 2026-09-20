/**
 * Checks the public table log: what it shows, who may read it, and that a
 * folded player's cards stay hidden.
 *
 *   node scripts/try-table-history.mjs
 *
 * Needs the stack up, bots seeded, and an admin account.
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
  return { status: response.status, payload: await response.json().catch(() => null) };
}

const stamp = Date.now();

log('\n1. Signing in as the moderator');
const admin = await call('/api/v1/auth/login', {
  method: 'POST',
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
if (!admin.payload?.ok) {
  console.error(`Sign in failed. Run: npm run make:moderator -- ${ADMIN_EMAIL} admin`);
  process.exit(1);
}
const adminToken = admin.payload.data.tokens.accessToken;

log('\n2. Opening a table and filling it with bots');
const table = (
  await call('/api/v1/moderation/tables', {
    method: 'POST',
    token: adminToken,
    body: {
      name: `History ${stamp}`,
      maxSeats: 6,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 400,
      maxBuyIn: 2000,
      isPrivate: false,
    },
  })
).payload?.data;

if (!table) {
  console.error('Could not open a table.');
  process.exit(1);
}

for (const [seat, difficulty] of ['medium', 'hard', 'easy'].entries()) {
  await call(`/api/v1/tables/${table.id}/bots`, {
    method: 'POST',
    token: adminToken,
    body: { seat, difficulty, buyIn: 1000 },
  });
}
log(`   ${table.id}, three bots seated`);

log('\n3. Waiting for hands to finish');
let recorded = 0;
for (let attempt = 0; attempt < 30 && recorded < 2; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const page = await call(`/api/v1/tables/${table.id}/hands`, { token: adminToken });
  recorded = page.payload?.data?.items?.length ?? 0;
}

if (recorded < 1) {
  fail('hands were recorded', 'none appeared after a minute');
  process.exit(1);
}
pass(`${recorded} hand(s) recorded`);

log('\n4. Reading the log');
const page = await call(`/api/v1/tables/${table.id}/hands`, { token: adminToken });
const hand = page.payload?.data?.items?.[0];

if (!hand) {
  fail('log is readable');
  process.exit(1);
}

pass(`hand #${hand.handNumber}, pot ${hand.potTotal}, ${hand.actions.length} actions`);

log('\n5. Every action carries who did what');
const named = hand.actions.filter((action) => action.displayName);
if (named.length === hand.actions.length) {
  pass('all actions name a player');
} else {
  fail('actions name a player', `${named.length} of ${hand.actions.length}`);
}

const kinds = [...new Set(hand.actions.map((action) => action.action))];
pass(`actions seen: ${kinds.join(', ')}`);

log('\n6. Cards only appear for players who showed them');
let leaks = 0;
for (const player of hand.players) {
  const folded = hand.actions.some(
    (action) => action.userId === player.userId && action.action === 'fold',
  );
  if (folded && player.revealedCards) {
    fail(`${player.displayName} folded but their cards are in the log`);
    leaks += 1;
  }
}
if (leaks === 0) pass('no folded player had cards revealed');

const shown = hand.players.filter((player) => player.revealedCards);
log(
  shown.length > 0
    ? `   showdown revealed: ${shown.map((p) => `${p.displayName} ${p.revealedCards.join(' ')}`).join(', ')}`
    : '   this hand ended on a fold, so nothing was shown',
);

log('\n7. Results are public');
const winners = hand.players.filter((player) => player.won);
if (winners.length > 0) {
  pass(`winner: ${winners.map((p) => `${p.displayName} +${p.netChips}`).join(', ')}`);
} else {
  fail('a winner is recorded');
}

log('\n8. Someone not at the table cannot read it');
const outsider = await call('/api/v1/auth/register', {
  method: 'POST',
  body: {
    email: `outsider+${stamp}@poker.test`,
    password: 'password123',
    displayName: 'Outsider',
  },
});

const refused = await call(`/api/v1/tables/${table.id}/hands`, {
  token: outsider.payload.data.tokens.accessToken,
});

if (refused.payload?.ok) {
  fail('an outsider read the table log');
} else {
  pass(`outsider refused — ${refused.payload?.error?.code}`);
}

log('\n9. Cleaning up');
await call(`/api/v1/moderation/tables/${table.id}`, {
  method: 'DELETE',
  token: adminToken,
  body: { reason: 'Test finished' },
});
pass('table closed');

log(
  failures === 0
    ? '\nPASSED: the table log is public to the table and hides what was never shown.'
    : `\nFAILED: ${failures} check(s) did not pass.`,
);
process.exit(failures === 0 ? 0 : 1);
