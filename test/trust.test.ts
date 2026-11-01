import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/trust.ts';

test('score starts neutral and moves with outcomes', () => {
  const l = new Ledger();
  assert.equal(l.score('Mum'), 50);
  l.append({ subject: 'Mum', amountUsd: 10, status: 'completed', ref: 'a' });
  assert.equal(l.score('Mum'), 60);
  l.append({ subject: 'Mum', amountUsd: 10, status: 'failed', ref: 'b' });
  assert.equal(l.score('Mum'), 40);
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
test('spentToday only counts completed payments from today', () => {
  const l = new Ledger();
  l.append({ subject: 'Mum', amountUsd: 10, status: 'completed', ref: 'a' });
  l.append({ subject: 'Mum', amountUsd: 99, status: 'failed', ref: 'b' });
  l.append({ subject: 'Mum', amountUsd: 40, status: 'completed', ref: 'c', at: '2020-01-01T00:00:00.000Z' });
  assert.equal(l.spentToday(), 10);
});
