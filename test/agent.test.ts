import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/agent.ts';
import type { Deps } from '../src/agent.ts';
import { DEFAULT_POLICY } from '../src/policy.ts';
import { MockProvider } from '../src/swap.ts';
import { Ledger } from '../src/trust.ts';

function setup(confirm = true) {
  const provider = new MockProvider();
  const ledger = new Ledger();
  const logs: string[] = [];
  const deps: Deps = {
    provider,
    ledger,
    policy: DEFAULT_POLICY,
    contacts: [{ name: 'Mum', chain: 'sol', address: 'x' }],
    confirm: async () => confirm,
    log: (m) => logs.push(m),
    ngnPerUsd: 1500,
  };
  return { provider, ledger, logs, deps };
}

test('happy path records a completed claim', async () => {
  const { deps, ledger } = setup();
  assert.equal(await handle('send $15 to Mum', deps), 'done');
  assert.equal(ledger.completedCount('Mum'), 1);
});
test('user decline sends nothing and records nothing', async () => {
  const { deps, ledger, provider } = setup(false);
  assert.equal(await handle('send $15 to Mum', deps), 'cancelled');
  assert.equal(ledger.claims.length, 0);
  assert.equal(provider.n, 0);
});
test('policy block never reaches the provider', async () => {
  const { deps, provider } = setup();
  assert.equal(await handle('send $500 to Mum', deps), 'blocked');
  assert.equal(provider.n, 0);
});
test('failed swap lowers the trust score', async () => {
  const { deps, ledger, provider } = setup();
  provider.failNext = true;
  assert.equal(await handle('send $15 to Mum', deps), 'failed');
  assert.equal(ledger.score('Mum'), 30);
});
test('unknown contact and gibberish are handled', async () => {
  const { deps } = setup();
  assert.equal(await handle('send $5 to Nobody', deps), 'unknown_contact');
  assert.equal(await handle('hello', deps), 'unparsed');
});
