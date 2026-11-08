# Trustpal

**A business an AI can run but cannot rob.**

Trustpal gives an AI a role in a small business's payment operations without giving it unrestricted control of the business's money. The AI reads invoices and proposes payments. The owner approves the exact payment. A smart contract on NEAR is the only thing that can move money, and it enforces the owner's rules whatever the AI is told.

Built for NEAR HACKATHON, Nov 2026. Tracks: Autonomous Business (lead) and AI Security & Defense. Written during the hackathon window (first commit 1 Nov 2026).

**Libraries used:** near-sdk 5 (Rust contract), near-api-js, @near-wallet-selector (core, modal-ui, Meteor, MyNearWallet), @near-js/transactions, esbuild (bundles the wallet code). **AI assistance:** most of the code was written with Claude; the team deployed and ran every live test.

## The story in 30 seconds

A small studio receives 10 NEAR from a client. The contract splits it at once: shares go to collaborators, the rest stays in the treasury. Later a contractor sends an invoice. The AI reads it and prepares the payment, but a poisoned copy of the invoice swaps in a different wallet. The guard flags it. And even if the AI were fooled, the contract refuses, because the owner never approved that exact payment.

## How it works

```
CLIENT ──pays──▶ TRUSTPAL CONTRACT ──fixed split──▶ collaborators + treasury

INVOICE ─▶ AI agent ─▶ Guard ─▶ Owner's rules ─▶ Contract ─▶ payment
 (proposes)  (checks payee)  (exact approval     (final say)
                              or payee list)

If the AI is fooled: the contract still enforces the owner's approval.
```

- **Exact-payment approval.** The owner approves reference, recipient, amount and expiry. The contract verifies the request exactly matches it, then consumes it. One use only.
- **A restricted AI key.** The agent key lives on the owner's account but NEAR limits it to calling `pay` on the policy contract. It cannot approve, change limits, change the split, add keys or call other contracts.
- **Limits and payees.** Per-payment limit, daily limit, a payee list, a wait before a new payee can be paid, a pause switch.
- **Revenue split.** Incoming client payments are divided by rules only the owner can change. The AI cannot change the percentages.
- **Guard.** Application-level checks (look-alike addresses, blocklist, account exists). Useful but advisory: the contract does not depend on it.
- **Activity log.** Hash-chained, so editing an entry that is still in the log is detected. It is kept by the app, not on the blockchain, and deleting the newest entries would not be detected, so it is a convenience record, not a complete audit trail.

## What is proven, and how

| Group | What | Detail |
| --- | --- | --- |
| **Live on NEAR testnet** | Fraud refused; approved invoice paid; replay rejected; AI key refused 6 of 6 forbidden actions (re-run with the stricter `npm run key-limits`, which prints the key's real permission and treats network errors as inconclusive); revenue split 0.5 / 0.2 / 0.3 | Transaction ids and steps in [DEMO.md](DEMO.md) |
| **Tested offline** | 28 contract unit tests, 32 application tests (guard, AI layer, activity log, offline simulation, dashboard server) | `npm test` and `npm run test:contract` |
| **Simulated / prototype** | Scripted AI (unless an API key is set); dashboard practice mode; animation is a replay of the real result | Labelled on every dashboard screen |

## Run it

```bash
node --version       # must be 22.18 or newer (the tests run TypeScript files directly)
npm install
npm test             # 32 application tests (does NOT run the contract tests)
npm run test:contract   # 28 contract tests; needs Rust and Cargo 1.85 or newer
npm run web          # landing page + dashboard (practice mode): http://localhost:3000
```

The full 5-minute walkthrough is in [DEMO.md](DEMO.md).

Live testnet: copy `.env.example` to `.env` with the agent key and accounts, then `npm run web -- --live`. To rebuild the deployment from scratch, run `scripts/setup-testnet.sh` (needs Linux or a Codespace, near-cli-rs, cargo-near, a funded testnet owner account, and a policy account name that does not exist yet). Without the agent key a visitor cannot run the live path; practice mode needs nothing but Node.

## The dashboard

Overview, Invoices (the AI reads an invoice), Approvals, Revenue split, Who can do what, Owner settings, Activity and Security lab. A bar of four gates shows where each payment is stopped. The page shows whether it is in practice mode (an offline simulation) or live testnet. The page never holds the owner key. On testnet, approving and cancelling a payment is signed in your wallet (Meteor tested); limits, payees, split and pause are still printed as commands for `scripts/owner.sh`. In live mode the local server holds the restricted agent key, so it only answers requests from its own page (Host and Origin checks; in a Codespace its own forwarded address is allowed automatically, other hosts via `ALLOWED_HOSTS`).

## Repo map

| Path | What |
| --- | --- |
| `contract/` | Rust smart contract (near-sdk 5), 28 unit tests |
| `src/chain.ts` | Chain interface, offline simulation of the contract's main rules, NEAR testnet client |
| `src/guard.ts`, `src/counterparty.ts` | Payee checks and the payment guard |
| `src/assistant.ts` | AI layer: scripted stand-in, optional real Claude model |
| `src/trust.ts` | Hash-chained activity log (kept in a local file in live mode) |
| `src/web.ts`, `public/` | Dashboard server and site |
| `scripts/` | `owner.sh`, `setup-testnet.sh`, `keygen.ts`, `key-limits.ts` |
| `DEMO.md` | Judge walkthrough |
| `DEFENCE_NOTE.md` | Full defence note |
| `THREAT_MODEL.md` | Attacks, defences, assumptions |

## Honest limits

Testnet only. Not audited. Native NEAR only (NEP-141 stablecoins are the next step for the Real-World Money track). The owner key is the master key: if stolen, every rule can be changed; a hardware wallet or multisig owner is the intended next step. Approvals are signed in a wallet, but other owner changes still use the command line, and there are no email accounts or team roles yet. The contract holds each business's rules, but only one business is deployed (`omni6nt-policy3.testnet`); a factory for many businesses is future work. A failed transfer burns its invoice reference, and an expired approval keeps its reference until cancelled, so the owner uses a new reference. The policy account has its own full-access key from deployment, which can redeploy the contract; delete it to freeze the code. The look-alike check is a heuristic in the guard; the contract does not need it, because unapproved addresses are rejected anyway. The AI is a scripted stand-in unless an API key is set. The code was written with AI assistance (Claude); the deployment and every live test were run by the team.

See [DEFENCE_NOTE.md](DEFENCE_NOTE.md) for the full list.

## License

MIT, see `LICENSE`.
