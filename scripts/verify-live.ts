// Read-only check of the live testnet deployment. Needs NO keys and moves no funds: anyone can run it.
//   npm run verify-live
//   npm run verify-live -- INV-3004 INV-3002        (check specific payment references)
// Optional: OWNER_ID=... POLICY_ID=... to point it at another deployment.
import { JsonRpcProvider } from 'near-api-js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const OWNER = process.env.OWNER_ID || 'omni6nt-owner.testnet';
const POLICY = process.env.POLICY_ID || 'omni6nt-policy3.testnet';
const refs = process.argv.slice(2).length ? process.argv.slice(2) : ['INV-3002', 'INV-3004'];
const provider = new JsonRpcProvider({ url: process.env.RPC_URL || 'https://rpc.testnet.fastnear.com' });
const view = (method: string, args: object) => provider.callFunction({ contractId: POLICY, method, args }) as Promise<any>;
const keysOf = async (account_id: string): Promise<any[]> => ((await (provider as any).query({ request_type: 'view_access_key_list', finality: 'final', account_id })).keys ?? []);
const near = (y: string) => { const s = y.padStart(25, '0'); return `${s.slice(0, -24)}.${s.slice(-24).replace(/0+$/, '') || '0'} NEAR`; };

try {
let problems = 0;
const bad = (m: string) => { problems++; console.log('  PROBLEM: ' + m); };

console.log(`Deployment: policy contract ${POLICY}, owner ${OWNER}\n`);

console.log('1. The rules the contract holds right now');
const pol = await view('get_policy', {});
console.log(`   per-payment limit ${near(pol.max_per_payment)}, daily cap ${near(pol.daily_cap)}, remaining today ${near(pol.remaining_today)}, paused: ${pol.paused}`);
console.log(`   new-recipient wait ${pol.cooldown_seconds ?? '?'}s, revenue received so far ${near(pol.revenue_total ?? '0')}\n`);

console.log('2. The AI agent key (read from the owner account)');
const ownerKeys = await keysOf(OWNER);
const agentKeys = ownerKeys.filter((k) => k.access_key?.permission?.FunctionCall?.receiver_id === POLICY);
if (!agentKeys.length) bad(`no function-call key for ${POLICY} found on ${OWNER}`);
for (const k of agentKeys) {
  const fc = k.access_key.permission.FunctionCall;
  const m: string[] = fc.method_names;
  const only = m.length === 1 && m[0] === 'pay';
  // Keys that can only call read-only getters (get_*) cannot move money or change rules. Wallet sign-in often leaves these behind.
  const readOnly = m.length > 0 && m.every((x) => /^get_[a-z_]+$/.test(x));
  const verdict = only ? 'OK (pay only)' : readOnly ? 'OK (read-only getters, cannot move money; usually left by a wallet sign-in)' : m.length === 0 ? 'ANY METHOD' : 'CAN CALL MORE THAN pay';
  console.log(`   ${k.public_key}: can only call ${JSON.stringify(m)} on ${fc.receiver_id}  ${verdict}`);
  if (!only && !readOnly) bad('a key on the owner account can call more than pay');
}
const full = ownerKeys.filter((k) => k.access_key?.permission === 'FullAccess').length;
console.log(`   (${OWNER} also has ${full} full-access key(s): that is the owner's own key.)\n`);

console.log('3. Can the contract code still be changed? (the policy account\'s own keys)');
const pk = await keysOf(POLICY);
const pfull = pk.filter((k) => k.access_key?.permission === 'FullAccess');
if (pfull.length === 0) console.log('   FROZEN: the policy account has no full-access key, so its code cannot be changed.\n');
else { console.log(`   NOT FROZEN: ${pfull.length} full-access key(s) can still redeploy the contract. This is a prototype risk; see THREAT_MODEL.md.\n`); }

console.log('3b. Is the deployed code the code in this repository?');
try {
  const acct = await (provider as any).query({ request_type: 'view_account', finality: 'final', account_id: POLICY });
  const code = await (provider as any).query({ request_type: 'view_code', finality: 'final', account_id: POLICY });
  const onchain = createHash('sha256').update(Buffer.from(code.code_base64, 'base64')).digest('hex');
  console.log(`   on-chain code hash (NEAR): ${acct.code_hash}`);
  console.log(`   on-chain code sha256 (hex): ${onchain}`);
  const wasmPath = process.env.WASM_PATH || (existsSync('contract/deployed/trustpal_policy.wasm') ? 'contract/deployed/trustpal_policy.wasm' : 'contract/target/near/trustpal_policy.wasm');
  if (existsSync(wasmPath)) {
    const local = createHash('sha256').update(readFileSync(wasmPath)).digest('hex');
    console.log(`   local build ${wasmPath}: ${local}`);
    console.log(local === onchain ? '   MATCH: the deployed bytecode is identical to this local build.' : '   DIFFERENT: the deployed bytecode is not this local build (a different build or toolchain gives different bytes).');
    console.log('   A match proves the bytes are the same. It does not prove the contract is secure or correctly configured.\n');
  } else {
    console.log(`   No local build found at ${wasmPath}. To compare: cd contract && cargo near build non-reproducible-wasm, then re-run. Record the source commit, toolchain and both hashes.\n`);
  }
} catch (e) { console.log(`   Could not read the deployed code (${(e as Error).message}). Treat as INCONCLUSIVE.\n`); }

console.log('4. Recorded payments');
for (const r of refs) {
  const p = await view('get_payment', { reference: r }).catch(() => null);
  if (!p) console.log(`   ${r}: not found`);
  else console.log(`   ${r}: ${p.status}, ${near(String(p.amount))} to ${p.recipient}`);
}
console.log(problems ? `\n${problems} problem(s) found.` : '\nAll checks passed.');
  process.exit(problems ? 1 : 0);
} catch (e: any) {
  console.log(`\nINCONCLUSIVE: could not read the network (${String(e?.cause?.code ?? e?.message ?? e).slice(0, 120)}). Check your connection, or set RPC_URL, and run it again.`);
  process.exit(2);
}
