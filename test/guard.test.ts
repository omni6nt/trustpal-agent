import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockChain, nearToYocto, yoctoToNear } from '../src/chain.ts';
import { checkCounterparty } from '../src/counterparty.ts';
import { guardedPay } from '../src/guard.ts';
import { Ledger } from '../src/trust.ts';

const mk = (ask = true) => {
  const chain = new MockChain(new Set(['good.testnet']), nearToYocto('1'), nearToYocto('2'), nearToYocto('10'));
  const logs: string[] = [];
  const deps = {
    chain, ledger: new Ledger(),
    blocklist: [{ address: 'bad.testnet', evidence: 'test' }],
    askHuman: async () => ask, log: (m: string) => logs.push(m),
  };
  return { chain, deps, logs };
};

test('nearToYocto / yoctoToNear are exact', () => {
  assert.equal(nearToYocto('1'), 10n ** 24n);
  assert.equal(nearToYocto('0.000000000000000000000001'), 1n);
  assert.equal(yoctoToNear(nearToYocto('2.5')), '2.5');
  assert.throws(() => nearToYocto('-1'));
  assert.throws(() => nearToYocto('1e3'));
});

test('unapproved address is BLOCKed and nothing is paid', async () => {
  const { deps } = mk();
  const r = await guardedPay('evil.testnet', nearToYocto('0.5'), 'r1', deps);
  assert.equal(r.status, 'REFUSED_BY_GUARD');
});

test('blocklisted address is BLOCKed with its evidence', async () => {
  const { deps } = mk();
  const c = await checkCounterparty('bad.testnet', deps);
  assert.equal(c.verdict, 'BLOCK');
  assert.ok(c.reasons.some((x) => x.includes('test')));
});

test('first payment to an approved address WARNs; human yes pays, human no does not', async () => {
  const a = mk(true);
  assert.equal((await guardedPay('good.testnet', nearToYocto('0.5'), 'r1', a.deps)).status, 'PAID');
  const b = mk(false);
  assert.equal((await guardedPay('good.testnet', nearToYocto('0.5'), 'r1', b.deps)).status, 'DECLINED_BY_HUMAN');
});

test('second payment to the same address is ALLOW (history on the exact address)', async () => {
  const { deps } = mk();
  await guardedPay('good.testnet', nearToYocto('0.1'), 'r1', deps);
  assert.equal((await checkCounterparty('good.testnet', deps)).verdict, 'ALLOW');
});

test('guard bypassed: the chain itself still rejects', async () => {
  const { chain } = mk();
  const r = await chain.pay('evil.testnet', nearToYocto('0.5'), 'x');
  assert.ok(!r.ok && r.error.includes('not on the approved list'));
});

test('over per-payment limit and daily limit are rejected; reference cannot be reused', async () => {
  const { chain } = mk();
  assert.ok(!(await chain.pay('good.testnet', nearToYocto('1.5'), 'a')).ok);
  assert.ok((await chain.pay('good.testnet', nearToYocto('1'), 'b')).ok);
  assert.ok((await chain.pay('good.testnet', nearToYocto('1'), 'c')).ok);
  const d = await chain.pay('good.testnet', nearToYocto('0.1'), 'd');
  assert.ok(!d.ok && d.error.includes('daily limit'));
  const e = await chain.pay('good.testnet', nearToYocto('0.1'), 'b');
  assert.ok(!e.ok && e.error.includes('already used'));
});

test('invalid account id is BLOCKed', async () => {
  const { deps } = mk();
  assert.equal((await checkCounterparty('Bad Address!', deps)).verdict, 'BLOCK');
});

test('blocked attempts are audited and do not change trust score', async () => {
  const { deps } = mk();
  await guardedPay('evil.testnet', nearToYocto('0.5'), 'r1', deps);
  assert.equal(deps.ledger.claims.length, 1);
  assert.equal(deps.ledger.score('evil.testnet'), 50);
  assert.ok(deps.ledger.verify().ok);
});
