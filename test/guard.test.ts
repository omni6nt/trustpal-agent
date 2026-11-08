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

test('accepted-but-unconfirmed payment is PENDING and not recorded as completed', async () => {
  const { chain, deps } = mk();
  (chain as any).pay = async () => ({ ok: true, txHash: 'x', settled: false });
  const r = await guardedPay('good.testnet', nearToYocto('0.1'), 'p1', deps);
  assert.equal(r.status, 'PENDING');
  assert.equal(deps.ledger.completedCount('good.testnet'), 0);
});

test('recipient inside the new-recipient cooldown is BLOCKed by the guard and by the chain', async () => {
  const { chain, deps } = mk();
  chain.approvedAtMs.set('good.testnet', Date.now());
  chain.cooldownSeconds = 600;
  const c = await checkCounterparty('good.testnet', deps);
  assert.equal(c.verdict, 'BLOCK');
  assert.ok(c.reasons.some((r) => r.includes('cooldown')));
  const direct = await chain.pay('good.testnet', nearToYocto('0.1'), 'cd1');
  assert.ok(!direct.ok && direct.error.includes('approved too recently'));
});

test('non-existent account is BLOCKed; a contract address WARNs', async () => {
  const { chain, deps } = mk();
  chain.accounts.set('good.testnet', { exists: false, isContract: false, balance: 0n });
  assert.equal((await checkCounterparty('good.testnet', deps)).verdict, 'BLOCK');
  chain.accounts.set('good.testnet', { exists: true, isContract: true, balance: 1n });
  const c = await checkCounterparty('good.testnet', deps);
  assert.equal(c.verdict, 'WARN');
  assert.ok(c.reasons.some((r) => r.includes('smart contract')));
});

test('a failed on-chain lookup WARNs instead of blocking or crashing', async () => {
  const { chain, deps } = mk();
  chain.accountInfo = async () => { throw new Error('rpc down'); };
  const c = await checkCounterparty('good.testnet', deps);
  assert.ok(c.reasons.some((r) => r.includes('Could not check')));
  assert.notEqual(c.verdict, 'BLOCK');
});

test('owner-approved exact payment is ALLOWed, even to a new address, and works once', async () => {
  const { chain, deps } = mk();
  chain.approvePayment('inv-1', 'new-vendor.testnet', nearToYocto('0.5'), 3600);
  const r = await guardedPay('new-vendor.testnet', nearToYocto('0.5'), 'inv-1', deps);
  assert.equal(r.status, 'PAID');
  const again = await guardedPay('new-vendor.testnet', nearToYocto('0.5'), 'inv-1', deps);
  assert.notEqual(again.status, 'PAID');
});

test('invoice fraud: same reference, attacker address -> refused by the guard AND by the chain', async () => {
  const { chain, deps } = mk();
  chain.approvePayment('inv-1', 'good.testnet', nearToYocto('0.5'), 3600);
  const r = await guardedPay('attacker.testnet', nearToYocto('0.5'), 'inv-1', deps);
  assert.equal(r.status, 'REFUSED_BY_GUARD');
  const direct = await chain.pay('attacker.testnet', nearToYocto('0.5'), 'inv-1');
  assert.ok(!direct.ok && direct.error.includes('does not match what the owner approved'));
  // the real, matching payment still works afterwards
  assert.equal((await guardedPay('good.testnet', nearToYocto('0.5'), 'inv-1', deps)).status, 'PAID');
});

test('approval with a changed amount is refused; an expired approval is refused', async () => {
  const { chain, deps } = mk();
  chain.approvePayment('inv-2', 'good.testnet', nearToYocto('0.5'), 3600);
  assert.equal((await guardedPay('good.testnet', nearToYocto('0.9'), 'inv-2', deps)).status, 'REFUSED_BY_GUARD');
  chain.approvePayment('inv-3', 'good.testnet', nearToYocto('0.1'), 3600);
  chain.now = () => Date.now() + 2 * 3600 * 1000;
  const direct = await chain.pay('good.testnet', nearToYocto('0.1'), 'inv-3');
  assert.ok(!direct.ok && direct.error.includes('expired'));
});

test('revenue split: shares are paid, dust stays in the treasury, over-100% splits are rejected', () => {
  const { chain } = mk();
  assert.throws(() => chain.setSplit([{ account: 'a', bps: 9000 }, { account: 'b', bps: 2000 }]));
  chain.setSplit([{ account: 'a', bps: 7000 }, { account: 'b', bps: 2000 }, { account: 'c', bps: 1000 }]);
  const out = chain.receiveRevenue(nearToYocto('10') + 1n);
  assert.deepEqual(out.payouts.map((o) => o.amount), [nearToYocto('7'), nearToYocto('2'), nearToYocto('1')]);
  assert.equal(out.retained, 1n); // rounding dust stays in the treasury
  assert.equal(out.payouts.reduce((s, o) => s + o.amount, 0n) + out.retained, nearToYocto('10') + 1n);
});

test('treasury share: a 50/20 split keeps 30% in the treasury', () => {
  const { chain } = mk();
  chain.setSplit([{ account: 'a', bps: 5000 }, { account: 'b', bps: 2000 }]);
  const out = chain.receiveRevenue(nearToYocto('1'));
  assert.equal(out.retained, nearToYocto('0.3'));
});

test('look-alike of an approved address is BLOCKed with a clear reason; the real one is not', async () => {
  const { chain, deps } = mk();
  chain.approvePayment('inv-9', 'omni-alex.testnet', nearToYocto('0.1'), 3600);
  const fake = await checkCounterparty('omni-a1ex.testnet', deps);
  assert.equal(fake.verdict, 'BLOCK');
  assert.ok(fake.reasons.some((r) => r.includes('look-alike')));
  const fake2 = await checkCounterparty('good.testnet.', deps);
  assert.ok(fake2.reasons.some((r) => r.includes('not a valid')) || fake2.verdict === 'BLOCK');
  assert.ok(!(await checkCounterparty('good.testnet', deps)).reasons.some((r) => r.includes('look-alike')));
});

test('a blocklisted address is still refused when the owner approved it', async () => {
  const { chain, deps } = mk();
  chain.approvePayment('INV-B', 'bad.testnet', nearToYocto('0.1'), 3600);
  const r = await guardedPay('bad.testnet', nearToYocto('0.1'), 'INV-B', deps);
  assert.equal(r.status, 'REFUSED_BY_GUARD');
  assert.ok(r.check.reasons[0].includes('Blocklisted'));
});
