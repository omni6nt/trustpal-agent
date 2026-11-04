// Proves what the agent's restricted key CANNOT do, on testnet. Moves no funds if it works.
// Run: npm run key-limits
import { loadEnvFile } from 'node:process';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';

loadEnvFile('.env');
const { AGENT_KEY, OWNER_ID, POLICY_ID } = process.env;
if (!AGENT_KEY || !OWNER_ID || !POLICY_ID) throw new Error('Missing AGENT_KEY / OWNER_ID / POLICY_ID in .env');

const provider = new JsonRpcProvider({ url: 'https://rpc.testnet.fastnear.com' });
const acct = new Account(OWNER_ID, provider, KeyPairSigner.fromSecretKey(AGENT_KEY as any));
const ONE_HUNDREDTH = 10n ** 22n; // 0.01 NEAR

async function attempt(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`FAIL  ${name}: it WORKED, which is bad`);
    return false;
  } catch (e: any) {
    const msg = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 220);
    console.log(`OK    ${name}\n      refused: ${msg}`);
    return true;
  }
}

const results = [
  await attempt('send 0.01 NEAR straight from the owner account', () =>
    acct.transfer({ receiverId: 'omni6nt-alex.testnet', amount: ONE_HUNDREDTH })),
  await attempt('add a new full-access key to the owner account', () =>
    acct.addFullAccessKey(KeyPair.fromRandom('ed25519').getPublicKey())),
  await attempt('call a different method on the policy contract (set_paused)', () =>
    acct.callFunction({ contractId: POLICY_ID, methodName: 'set_paused', args: { paused: true }, gas: 30_000_000_000_000n })),
  await attempt('create an approval for itself (approve_payment)', () =>
    acct.callFunction({ contractId: POLICY_ID, methodName: 'approve_payment', args: { reference: 'x-' + Date.now(), recipient: 'attacker-wallet.testnet', amount: '1000000000000000000000000', valid_for_seconds: 3600 }, gas: 30_000_000_000_000n })),
  await attempt('rewrite the revenue split (set_split)', () =>
    acct.callFunction({ contractId: POLICY_ID, methodName: 'set_split', args: { shares: [{ account_id: 'attacker-wallet.testnet', bps: 10000 }] }, gas: 30_000_000_000_000n })),
  await attempt('call pay on some other contract', () =>
    acct.callFunction({ contractId: 'omni6nt-alex.testnet', methodName: 'pay', args: {}, gas: 30_000_000_000_000n })),
];
console.log(results.every(Boolean) ? '\nAll 6 forbidden actions were refused by the NEAR protocol/contract.' : '\nSOMETHING WAS ALLOWED. Do not continue.');
process.exit(results.every(Boolean) ? 0 : 1);
