import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/trust.ts';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreActivity } from '../src/restore.ts';

test('restored activity comes from the log, never invents a paid payment', () => {
  const l = new Ledger();
  l.append({ subject: 'a.testnet', amountUsd: 0, amountNear: '0.05', status: 'completed', ref: 'INV-1' });
  l.append({ subject: 'b.testnet', amountUsd: 0, amountNear: '0.1', status: 'failed', ref: 'INV-2' });
  l.append({ subject: 'c.testnet', amountUsd: 0, status: 'refunded', ref: 'INV-3' });
  const r = restoreActivity(l.claims);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.outcome), ['paid', 'stopped', 'info']);
  assert.ok(r.every((x) => /authoritative record/.test(x.headline)));
});
test('restore keeps only the newest entries', () => {
  const l = new Ledger();
  for (let i = 0; i < 50; i++) l.append({ subject: 'a.testnet', amountUsd: 0, status: 'completed', ref: 'R' + i });
  assert.equal(restoreActivity(l.claims, 40).length, 40);
});

test('F2: a ledger file with an edited row or an unreadable line does not verify', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'tp-')), 'l.jsonl');
  new Ledger(f).append({ subject: 'x', amountUsd: 0, status: 'blocked', ref: 'r1' });
  assert.equal(new Ledger(f).verify().ok, true);
  const row = JSON.parse(readFileSync(f, 'utf8').split('\n')[0]);
  writeFileSync(f, JSON.stringify({ ...row, status: 'completed' }) + '\n');
  assert.equal(new Ledger(f).verify().ok, false);
  writeFileSync(f, '{not json\n');
  assert.equal(new Ledger(f).verify().ok, false);
});
