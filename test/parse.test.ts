import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findContact, parseIntent } from '../src/parse.ts';

test('parses a simple request', () => {
  assert.deepEqual(parseIntent('send $50 to Mum'), { amountUsd: 50, recipient: 'Mum' });
});
test('handles "my" and trailing city', () => {
  assert.deepEqual(parseIntent('Please send 1,200 USD to my mum in Lagos'), {
    amountUsd: 1200,
    recipient: 'mum',
  });
});
test('rejects non-payment text and zero amounts', () => {
  assert.equal(parseIntent('what is the weather'), null);
  assert.equal(parseIntent('send $0 to Mum'), null);
});
test('finds contacts by name or alias, case-insensitive', () => {
  const cs = [{ name: 'Mum', aliases: ['mother'], chain: 'sol', address: 'x' }];
  assert.equal(findContact(cs, 'MOTHER')?.name, 'Mum');
  assert.equal(findContact(cs, 'dad'), undefined);
});
