import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY as P, evaluate } from '../src/policy.ts';

const ok = { amountUsd: 15, feeUsd: 0.1, spentTodayUsd: 0, trustScore: 60, completedCount: 3 };

test('allows a normal payment', () => {
  assert.equal(evaluate(P, ok).allowed, true);
});
test('blocks over the per-payment limit', () => {
  assert.equal(evaluate(P, { ...ok, amountUsd: 500 }).allowed, false);
});
test('blocks over the daily limit', () => {
  assert.equal(evaluate(P, { ...ok, spentTodayUsd: 295 }).allowed, false);
});
test('blocks high fees', () => {
  assert.equal(evaluate(P, { ...ok, feeUsd: 5 }).allowed, false);
});
test('blocks low trust score', () => {
  assert.equal(evaluate(P, { ...ok, trustScore: 10 }).allowed, false);
});
test('caps new recipients, lifts the cap after enough completed payments', () => {
  assert.equal(evaluate(P, { ...ok, amountUsd: 50, completedCount: 0 }).allowed, false);
  assert.equal(evaluate(P, { ...ok, amountUsd: 50, completedCount: 3 }).allowed, true);
});
