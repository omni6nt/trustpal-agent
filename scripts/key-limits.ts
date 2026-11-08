// Proves what the agent's restricted key CANNOT do, on testnet. Moves no funds if it works.
// Run: npm run key-limits
//
// How it avoids a false pass: (1) it reads the key's real permission from the network and prints it,
// (2) it only counts an action as "refused" when the error is a recognised permission refusal from NEAR,
// (3) any other error (no network, wrong account, timeout) is INCONCLUSIVE and the run exits non-zero.
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';

if (existsSync('.env')) loadEnvFile('.env');
const { AGENT_KEY, OWNER_ID, POLICY_ID } = process.env;
if (!AGENT_KEY || !OWNER_ID || !POLICY_ID) throw new Error('Missing AGENT_KEY / OWNER_ID / POLICY_ID in .env');

const provider = new JsonRpcProvider({ url: 'https://rpc.testnet.fastnear.com' });
const keyPair = KeyPair.fromString(AGENT_KEY as any);
const pub = keyPair.getPublicKey().toString();
const acct = new Account(OWNER_ID, provider, new KeyPairSigner(keyPair));
const ONE_HUNDREDTH = 10n ** 22n; // 0.01 NEAR

// 1. What the network says this key is allowed to do.
const info: any = await (provider as any).query({ request_type: 'view_access_key', finality: 'final', account_id: OWNER_ID, public_key: pub });
const perm = info?.permission;
if (!perm || perm === 'FullAccess' || !perm.FunctionCall) {
  console.log('FAIL: the agent key is NOT a restricted function-call key:', JSON.stringify(perm));
  process.exit(1);
}
const fc = perm.FunctionCall;
console.log(`Network says the agent key can only call: contract=${fc.receiver_id} methods=${JSON.stringify(fc.method_names)} allowance=${fc.allowance}\n`);
if (fc.receiver_id !== POLICY_ID || fc.method_names.length !== 1 || fc.method_names[0] !== 'pay') {
  console.log('FAIL: key is not limited to the single method "pay" on the policy contract.');
  process.exit(1);
}

// 2. Try each forbidden action. Only a recognised permission refusal counts.
const REFUSAL = /does not have permission|access key|AccessKeyNotFound|MethodNameMismatch|ReceiverMismatch|DepositWithFunctionCall|RequiresFullAccess|not allowed|Smart contract panicked|only the owner|Owner only|Only the owner/i;
type R = 'refused' | 'allowed' | 'inconclusive';
async function attempt(name: string, fn: () => Promise<unknown>): Promise<R> {
  try {
    await fn();
    console.log(`FAIL  ${name}: it WORKED, which is bad`);
    return 'allowed';
  } catch (e: any) {
    const msg = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 220);
    if (REFUSAL.test(msg + ' ' + String(e?.type ?? ''))) { console.log(`OK    ${name}\n      refused: ${msg}`); return 'refused'; }
    console.log(`??    ${name}\n      INCONCLUSIVE (not a permission refusal): ${msg}`);
    return 'inconclusive';
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
const refused = results.filter((r) => r === 'refused').length;
if (results.includes('allowed')) { console.log('\nSOMETHING WAS ALLOWED. Do not continue.'); process.exit(1); }
if (results.includes('inconclusive')) { console.log(`\nINCONCLUSIVE: ${refused} of ${results.length} were clearly refused; the rest failed for another reason (network?). Re-run with a working connection.`); process.exit(2); }
console.log(`\nAll ${results.length} forbidden actions were refused with a NEAR permission error, and the network confirms the key is limited to "pay".`);
