# Trustpal Agent

**An AI payment agent that can prepare payments but cannot overspend or pay the wrong address.**

Built for NEAR HACKATHON (Nov 2026). Tracks: **AI Security & Defense** (lead) and Real-World Money.

> Status: working prototype on NEAR **testnet**. This README says what is verified, what is mocked and what is not built. See [THREAT_MODEL.md](THREAT_MODEL.md).

## The problem

An AI agent that can move money is only as safe as the weakest text it reads. A poisoned invoice, a pasted message or a hijacked tool can tell it to pay an attacker. Prompts and guardrails are not a security boundary.

## The idea

**The AI proposes. A NEAR contract decides.**

1. Funds sit in a small **policy contract** (`contract/`), not in the agent's wallet.
2. The contract enforces, on chain: an approved-recipient list, a per-payment cap, a daily cap (reserved before the transfer), single-use payment references and a pause switch.
3. The agent holds only a NEAR **function-call key** limited to `pay` on that contract. It cannot send NEAR, add keys or call anything else.
4. Before signing, a **guard** checks the counterparty (ALLOW / WARN / BLOCK, with reasons). BLOCK refuses; WARN asks a human.
5. Every attempt, allowed or refused, goes into a hash-chained audit log.

Even if the guard and the AI are fully compromised, the contract still refuses.

## What is verified

| Claim | Evidence |
|---|---|
| Real payments on testnet from the policy contract | `npm run web -- --live`, button 1; visible on the NEAR explorer |
| Contract rejects unapproved recipients and over-limit amounts | web demo buttons 3 and 4; `npm run attack -- --live` |
| Agent key cannot transfer NEAR, add keys, call other methods or contracts | `npm run key-limits` |
| Guard refuses a poisoned invoice | web demo button 2; `npm run attack` |
| 27 offline JS tests, 10 contract unit tests | `npm test`; `cd contract && cargo test` |

## Try it

Requires Node.js 22.18+.

```bash
git clone https://github.com/omni6nt/trustpal-agent.git
cd trustpal-agent
npm install
npm test            # expect: pass 27, fail 0
npm run attack      # offline mock of the contract rules
npm run web         # open http://localhost:3000
```

Offline mode uses a mock that applies the same rules as the contract. It is a demo aid, not the security boundary.

### Live on testnet

You need your own testnet accounts and a deployed contract (`contract/`, build with `cargo near build`).

```bash
npm run keygen      # saves the private key to .env, prints only the public key
# add that public key to your account as a function-call key limited to `pay`
# then set OWNER_ID, POLICY_ID, LEGIT_ID in .env
npm run web -- --live
npm run key-limits
```

Never commit `.env` or paste a private key anywhere.

## NOT built yet

- No fungible-token (stablecoin) payments; native NEAR only.
- No cross-chain payouts. NEAR Intents has no testnet; `src/swap.ts` is an older prototype path, written from docs and never tested live.
- No global reputation or scam database. The counterparty check uses the owner's approved list, a local evidence-backed blocklist and our own payment history.
- No Nigerian bank payout. Any naira figure in the old demo is indicative only.
- The contract is not audited.

## NEAR technologies

- A custom NEAR smart contract (Rust, `near-sdk` 5) deployed on testnet.
- NEAR function-call access keys for the agent's restricted authority.
- `near-api-js` for the agent's calls and views.
- NEAR Intents 1Click API (dry-run quotes, prototype only).

## AI use

This project was built with AI assistance (Claude, ChatGPT). Code is reviewed and tested by the authors. The demo "AI" that gets manipulated is a deliberate script, not a model.

## Layout

```
contract/src/lib.rs     policy contract (Rust)
src/chain.ts            chain adapter: MockChain and NearChain (restricted key)
src/counterparty.ts     ALLOW / WARN / BLOCK checks
src/guard.ts            wrapper around the only action that moves money
src/attack.ts           prompt-injection demo
src/web.ts              local demo page
src/trust.ts            hash-chained audit ledger
scripts/keygen.ts       creates the agent key (never prints it)
scripts/key-limits.ts   proves what the agent key cannot do
```

## License

MIT
