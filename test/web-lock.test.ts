import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';

// The dashboard locks itself when DASHBOARD_TOKEN is set (and always in --live mode).
const PORT = 3918, TOKEN = 'testtoken123';
let srv: ChildProcess;
function call(path: string, cookie?: string, method = 'GET'): Promise<{ status: number; headers: any; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${PORT}` };
    if (cookie) headers.cookie = cookie;
    const r = request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: b })); });
    r.on('error', reject); r.end();
  });
}
before(async () => {
  srv = spawn(process.execPath, ['src/web.ts'], { env: { ...process.env, PORT: String(PORT), DASHBOARD_TOKEN: TOKEN }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await call('/'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
after(() => { srv.kill(); });

test('without the sign-in cookie the API and the dashboard are refused', async () => {
  assert.equal((await call('/api/state')).status, 401);
  assert.equal((await call('/api/agent', undefined, 'POST')).status, 401);
  assert.equal((await call('/api/run?s=legit', undefined, 'POST')).status, 401);
  assert.equal((await call('/app')).status, 401);
  assert.equal((await call('/app.js')).status, 401);
});
test('a wrong token does not sign you in', async () => {
  const r = await call('/app?t=wrong');
  assert.equal(r.status, 401);
  assert.ok(!r.headers['set-cookie']);
});
test('the landing page and the client payment page stay public', async () => {
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/pay.html')).status, 200);
});
test('the right token sets a cookie, and the cookie unlocks the API', async () => {
  const r = await call(`/app?t=${TOKEN}`);
  assert.equal(r.status, 302);
  const cookie = String(r.headers['set-cookie']?.[0] ?? '').split(';')[0];
  assert.match(cookie, /^tp_session=/);
  assert.match(String(r.headers['set-cookie']?.[0]), /HttpOnly; SameSite=Strict/);
  assert.equal((await call('/api/state', cookie)).status, 200);
  assert.equal((await call('/app', cookie)).status, 200);
});
