// Interactive agent. `npm start` = mock mode; `npm run live` = real NEAR Intents swaps.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { handle } from './agent.ts';
import type { Deps } from './agent.ts';
import { parseWithClaude } from './llm.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { IntentsProvider, MockProvider } from './swap.ts';
import { Ledger } from './trust.ts';
import type { Contact, SwapProvider } from './types.ts';

const live = process.argv.includes('--live');
const env = process.env;
const contacts: Contact[] = JSON.parse(readFileSync('contacts.json', 'utf8'));

let provider: SwapProvider;
if (live) {
  for (const k of ['ONE_CLICK_JWT', 'REFUND_ADDRESS']) {
    if (!env[k]) {
      console.error(`Missing ${k}. See .env.example (export the variables, then run again).`);
      process.exit(1);
    }
  }
  provider = new IntentsProvider({
    jwt: env.ONE_CLICK_JWT!,
    refundTo: env.REFUND_ADDRESS!,
    originChain: env.ORIGIN_CHAIN ?? 'arb',
    originSymbol: env.ORIGIN_SYMBOL ?? 'USDC',
  });
} else {
  provider = new MockProvider();
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const apiKey = env.ANTHROPIC_API_KEY;
const deps: Deps = {
  provider,
  ledger: new Ledger('data/claims.jsonl'),
  policy: DEFAULT_POLICY,
  contacts,
  confirm: async (s) => /^y(es)?$/i.test((await rl.question(`\n${s}\nConfirm? (y/n) `)).trim()),
  log: (m) => console.log(m),
  ngnPerUsd: Number(env.NGN_PER_USD ?? 1500),
  parse: apiKey ? (t) => parseWithClaude(t, contacts.map((c) => c.name), apiKey) : undefined,
};

console.log(`Trustpal agent (${live ? 'LIVE' : 'mock'} mode). Try: send $15 to Mum   (Ctrl+C to quit)`);
if (!deps.ledger.verify().ok) console.log('WARNING: claim ledger failed verification.');
for (;;) {
  const line = (await rl.question('> ')).trim();
  if (line) await handle(line, deps);
}
