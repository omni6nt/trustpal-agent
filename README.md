# Trustpal

**A business an AI can run but cannot rob.**

Trustpal gives an AI a role in a small business's payment operations without giving it unrestricted control of the business's money. The AI reads invoices and proposes payments. The owner approves the exact payment. A smart contract on NEAR is the only thing that can move money, and it enforces the owner's rules whatever the AI is told.

Built for NEAR HACKATHON, Nov 2026. Tracks: Autonomous Business (lead), Real-World Money, AI Security & Defense.

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
- **Activity log.** Hash-chained, so edited history is detected.

## What is proven, and how

| Group | What | Detail |
| --- | --- | --- |
| **Live on NEAR testnet** | Fraud refused; approved invoice paid; replay rejected; AI key refused 6 of 6 forbidden actions; revenue split 0.5 / 0.2 / 0.3 | Transaction ids and steps in [DEMO.md](DEMO.md) |
| **Tested offline** | 28 contract unit tests, 42 application tests, the dashboard | `npm test` |
| **Simulated / prototype** | Scripted AI (unless an API key is set); dashboard practice mode; animation is a replay of the real result | Labelled on every dashboard screen |

## Run it

```bash
npm install
npm test
npm run web          # landing page + dashboard (practice mode): http://localhost:3000
```

The full 5-minute walkthrough is in [DEMO.md](DEMO.md).

Live testnet: copy `.env.example` to `.env` with the agent key and accounts, then `npm run web -- --live`. To rebuild the deployment from scratch, run `scripts/setup-testnet.sh` (needs near-cli-rs and cargo-near).

## The dashboard

Overview, Invoices (the AI reads an invoice), Approvals, Revenue split, Who can do what, Owner settings, Activity and Security lab. A bar of four gates shows where each payment is stopped. Every screen says whether it is a practice-mode simulation or live testnet. The page never holds the owner key: on testnet, owner changes are printed as commands for `scripts/owner.sh`.

## Repo map

| Path | What |
| --- | --- |
| `contract/` | Rust smart contract (near-sdk 5), 28 unit tests |
| `src/chain.ts` | Chain interface, offline mock chain, NEAR testnet client |
| `src/guard.ts`, `src/counterparty.ts` | Payee checks and the payment guard |
| `src/assistant.ts` | AI layer: scripted stand-in, optional real Claude model |
| `src/trust.ts` | Hash-chained activity log |
| `src/web.ts`, `public/` | Dashboard server and site |
| `scripts/` | `owner.sh`, `setup-testnet.sh`, `keygen.ts`, `key-limits.ts` |
| `DEMO.md` | Judge walkthrough |
| `DEFENCE_NOTE.md` | Full defence note |
| `THREAT_MODEL.md` | Attacks, defences, assumptions |

## Honest limits

Testnet only. Not audited. Native NEAR only (NEP-141 stablecoins are the next step for the Real-World Money track). The owner key is the master key: if stolen, every rule can be changed; a hardware wallet or multisig owner is the intended next step. Owner approvals use the command line, not a wallet popup. The look-alike check is a heuristic in the guard; the contract does not need it, because unapproved addresses are rejected anyway. The AI is a scripted stand-in unless an API key is set. The code was written with AI assistance (Claude); the deployment and every live test were run by the team.

See [DEFENCE_NOTE.md](DEFENCE_NOTE.md) for the full list.

## License

MIT, see `LICENSE`.
