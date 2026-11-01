// Offline demo: no keys, no funds. Run: npm run demo
import { handle } from './agent.ts';
import type { Deps } from './agent.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { MockProvider } from './swap.ts';
import { Ledger } from './trust.ts';

const ledger = new Ledger();
const deps: Deps = {
  provider: new MockProvider(),
  ledger,
  policy: DEFAULT_POLICY,
  contacts: [
    { name: 'Mum', aliases: ['mother'], chain: 'sol', address: 'demo-address-1' },
    { name: 'Tunde', chain: 'sol', address: 'demo-address-2' },
  ],
  confirm: async (s) => {
    console.log(s + '\n  -> user confirms: yes');
    return true;
  },
  log: (m) => console.log('  ' + m),
  ngnPerUsd: 1500,
};

const steps: [string, string][] = [
  ['1. Normal payment', 'send $15 to my mum'],
  ['2. New recipient, amount too high', 'send $50 to Tunde'],
  ['3. Over the per-payment limit', 'send $500 to Mum'],
  ['4. Unknown recipient', 'send $10 to Chidi'],
];

for (const [title, text] of steps) {
  console.log(`\n${title}\n> ${text}`);
  await handle(text, deps);
}

console.log('\n5. Tamper check');
console.log('  ledger intact:', ledger.verify().ok);
ledger.claims[0].amountUsd = 1; // someone edits history
console.log('  after editing a past claim:', ledger.verify());
