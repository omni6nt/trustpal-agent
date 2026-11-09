import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/trust.ts';

test('completed payments are counted per address', () => {
  const l = new Ledger();
  assert.equal(l.completedCount('Mum'), 0);
  l.append({ subject: 'Mum', amountUsd: 10, status: 'completed', ref: 'a' });
  l.append({ subject: 'Mum', amountUsd: 10, status: 'failed', ref: 'b' });
  assert.equal(l.completedCount('Mum'), 1);
});
test('hash chain detects tampering', () => {
  const l = new Ledger();
  l.append({ subject: 'Mum', amountUsd: 10, status: 'completed', ref: 'a' });
  l.append({ subject: 'Mum', amountUsd: 20, status: 'completed', ref: 'b' });
  assert.equal(l.verify().ok, true);
  l.claims[0].amountUsd = 1;
  assert.deepEqual(l.verify(), { ok: false, brokenAt: 0 });
});
test('the NEAR amount is part of the hash, so editing it is detected', () => {
  const l = new Ledger();
  l.append({ subject: 'alex.testnet', amountUsd: 0, amountNear: '0.5', status: 'completed', ref: 'a' });
  assert.equal(l.verify().ok, true);
  l.claims[0].amountNear = '0.1';
  assert.deepEqual(l.verify(), { ok: false, brokenAt: 0 });
});
test('older log lines without amountNear still verify', () => {
  const l = new Ledger();
  l.append({ subject: 'Mum', amountUsd: 10, status: 'completed', ref: 'a' });
  assert.equal(l.claims[0].amountNear, undefined);
  assert.equal(l.verify().ok, true);
});
