// Creates the agent's restricted key. The PRIVATE key goes only into .env (git-ignored).
// The terminal shows ONLY the public key. Never paste a private key anywhere.
import { KeyPair } from 'near-api-js';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const envFile = '.env';
if (existsSync(envFile) && /^AGENT_KEY=/m.test(readFileSync(envFile, 'utf8'))) {
  console.error('.env already has an AGENT_KEY. Delete that line first if you really want a new key.');
  process.exit(1);
}
const kp = KeyPair.fromRandom('ed25519');
appendFileSync(envFile, `\nAGENT_KEY=${kp.toString()}\n`);
console.log('Private key saved to .env (not shown, not committed).');
console.log('PUBLIC key (safe to share):');
console.log(kp.getPublicKey().toString());
