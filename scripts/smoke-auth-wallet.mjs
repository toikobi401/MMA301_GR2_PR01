// End-to-end check for auth and wallet against a running server: node scripts/smoke-auth-wallet.mjs
const API = process.env.API_URL ?? 'http://localhost:4000';
let failures = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
};
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const health = await call('/health/ready');
ok(health.status === 200 && health.json?.data?.database === true, '/health/ready reports the database up', JSON.stringify(health.json));

const email = `w1+${Date.now()}@poker.test`;
const reg = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: 'password123', displayName: 'Week One' } });
ok(reg.status === 201 || reg.status === 200, 'register succeeds', `${reg.status} ${JSON.stringify(reg.json)}`);
const dup = await call('/api/v1/auth/register', { method: 'POST', body: { email, password: 'password123', displayName: 'Dup' } });
ok(dup.status === 409, 'duplicate email rejected with 409', String(dup.status));

const bad = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: 'wrongpass1' } });
ok(bad.status === 401, 'wrong password rejected with 401', String(bad.status));
const login = await call('/api/v1/auth/login', { method: 'POST', body: { email, password: 'password123' } });
ok(login.status === 200, 'login succeeds', String(login.status));
let { accessToken, refreshToken } = login.json.data.tokens;

const refreshed = await call('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
ok(refreshed.status === 200, 'refresh issues a new pair', String(refreshed.status));
const reused = await call('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
ok(reused.status === 401, 'old refresh token cannot be reused', String(reused.status));
accessToken = refreshed.json.data.tokens.accessToken;

const me = await call('/api/v1/auth/me', { token: accessToken });
ok(me.status === 200 && me.json.data?.email === email, '/me returns the user', JSON.stringify(me.json));

const wallet = await call('/api/v1/wallet', { token: accessToken });
ok(wallet.json?.data?.chips === 10000, 'new account starts with 10,000 chips', JSON.stringify(wallet.json?.data?.chips));

const dep = await call('/api/v1/wallet/deposit', { method: 'POST', token: accessToken, body: { amount: 500 } });
ok(dep.status === 200, 'deposit 500 succeeds', `${dep.status} ${JSON.stringify(dep.json)}`);
const over = await call('/api/v1/wallet/withdraw', { method: 'POST', token: accessToken, body: { amount: 999999 } });
ok(over.status === 400, 'withdrawing more than the balance is rejected', String(over.status));

// Balance is 10,500. Fifteen concurrent 1,050 withdrawals: exactly ten fit.
const results = await Promise.all(
  Array.from({ length: 15 }, () => call('/api/v1/wallet/withdraw', { method: 'POST', token: accessToken, body: { amount: 1050 } })),
);
const accepted = results.filter((r) => r.status === 200).length;
ok(accepted === 10, 'concurrent withdrawals: exactly 10 of 15 accepted', `accepted ${accepted}`);
const after = await call('/api/v1/wallet', { token: accessToken });
ok(after.json?.data?.chips === 0, 'balance ends at exactly 0, never negative', JSON.stringify(after.json?.data?.chips));

const tx = await call('/api/v1/wallet/transactions', { token: accessToken });
const items = tx.json?.data?.items ?? [];
ok(items.length === 12, 'ledger has bonus + deposit + 10 withdrawals', `got ${items.length}`);

const out = await call('/api/v1/auth/logout', { method: 'POST', token: accessToken, body: {} });
ok(out.status === 200 || out.status === 204, 'logout succeeds', String(out.status));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
