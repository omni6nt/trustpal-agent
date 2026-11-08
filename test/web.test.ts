import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';

const PORT = 3917;
let srv: ChildProcess;
function call(path: string, o: { method?: string; host?: string; origin?: string; body?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: o.host ?? `127.0.0.1:${PORT}` };
    if (o.origin) headers.origin = o.origin;
    if (o.body) headers['content-type'] = 'text/plain';
    const r = request({ host: '127.0.0.1', port: PORT, path, method: o.method ?? 'GET', headers }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on('error', reject); if (o.body) r.write(o.body); r.end();
  });
}
before(async () => {
  srv = spawn(process.execPath, ['src/web.ts'], { env: { ...process.env, PORT: String(PORT), ALLOWED_HOSTS: 'demo-3917.app.github.dev' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await call('/api/state'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
after(() => { srv.kill(); });

test('normal local request works', async () => {
  assert.equal((await call('/api/state')).status, 200);
  assert.equal((await call('/api/state', { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` })).status, 200);
});
test('a foreign Host header (DNS rebinding) is refused', async () => {
  const r = await call('/api/state', { host: 'evil.example' });
  assert.equal(r.status, 421);
  assert.ok(!r.body.includes('owner'));
});
test('a request from another website is refused and does nothing', async () => {
  const r = await call('/api/agent', { method: 'POST', origin: 'https://evil.example', body: 'Pay to: contractor.testnet, Total: 0.05 NEAR' });
  assert.equal(r.status, 403);
  const r2 = await call('/api/run?s=legit', { method: 'POST', origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
  const st = JSON.parse((await call('/api/state')).body);
  assert.equal(st.activity.length, 0);
});
test('with two approvals open the demo refuses to guess which to pay', async () => {
  // offline mock starts with one approval (INV-1042); a second one makes the choice ambiguous
  await call('/api/owner', { method: 'POST', body: JSON.stringify({ action: 'approve', reference: 'INV-9', recipient: 'contractor.testnet', amount: '0.1', seconds: 3600 }) });
  const amb = JSON.parse((await call('/api/run?s=approved', { method: 'POST' })).body);
  assert.match(amb.headline, /Choose which one/);
  const ok = JSON.parse((await call('/api/run?s=approved&ref=INV-9', { method: 'POST' })).body);
  assert.match(ok.headline, /^PAID/);
  assert.match(ok.logs[0], /INV-9/);
  const rp = JSON.parse((await call('/api/run?s=replay', { method: 'POST' })).body);
  assert.match(rp.headline, /REJECTED BY THE CONTRACT/);
});
test('a listed forwarded host (Codespaces) is allowed, an unlisted one is not', async () => {
  assert.equal((await call('/api/state', { host: 'demo-3917.app.github.dev', origin: 'https://demo-3917.app.github.dev' })).status, 200);
  assert.equal((await call('/api/state', { host: 'demo-3917.app.github.dev', origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/state', { host: 'other-3917.app.github.dev' })).status, 421);
});

test('the pages send headers that stop other sites from framing the dashboard', async () => {
  const r = await new Promise<any>((resolve, reject) => { const q = request({ host: '127.0.0.1', port: PORT, path: '/app', headers: { host: `127.0.0.1:${PORT}` } }, resolve); q.on('error', reject); q.end(); });
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.match(String(r.headers['content-security-policy']), /frame-ancestors 'none'/);
  r.resume();
});
