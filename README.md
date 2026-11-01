# Trustpal Agent

**An AI payment agent that prepares payments but cannot overspend or pay the wrong address.**

Built for NEAR HACKATHON (Nov 2026). Target tracks: **Real-World Money** and **AI Security & Defense**.

> **Status: early prototype (v0.1.0), work in progress.** This README says exactly what works today, what is mocked, and what is still planned. Nothing below is claimed unless it is marked as working.

## The idea

People and small businesses send money across borders (for example, paying a contractor in Lagos). Letting an AI agent handle that is risky: a manipulated agent could pay the wrong address or overspend.

Trustpal's design rule: **the AI interprets requests, but a separate, deterministic layer decides whether money may move.** The AI cannot talk its way past that layer.

## What works today

| Feature | Status |
|---|---|
| Chat-style request parsing (`send $15 to Mum`) | Working (regex parser; optional Claude parser, off by default, untested here) |
| Recipients come only from `contacts.json` (the AI cannot invent addresses) | Working |
| Deterministic spending policy: per-payment limit, daily limit, max fee, minimum trust score, cap for new recipients | Working (offline, tested) |
| Human confirmation before any payment | Working |
| Hash-chained claim ledger that detects edited history | Working (local file) |
| Offline demo with mock payments | Working |
| 18 automated tests | Passing (offline only) |
| NEAR Intents (1Click) quotes and swap status | Code written, **not yet tested live** |

## What is NOT built yet (be skeptical of anything not in the table above)

- **No on-chain enforcement yet.** In the current version the agent never signs or moves money. In live mode it prints a deposit address and the user sends funds by hand. So today the spending limits are enforced by the app, not by the blockchain.
- **No payout to Nigerian bank accounts.** NEAR Intents moves crypto between chains. Any naira figure shown is a fixed, indicative number, not a live rate.
- **No "cheapest route" comparison.** The agent shows one quote.
- **Trust score is only your own payment history with a contact**, not a global reputation or identity check.
- **Known issues being fixed** (found in review): two simultaneous payments can pass a daily limit; payments that time out are not counted as spent; a recipient's score is tied to the contact name, not the address; the executed quote is not compared to the approved one.

## Roadmap (in priority order)

1. **A small NEAR policy contract** holds the payment token and enforces, on-chain: an approved-recipient list, a per-payment cap, a daily cap (reserved before the transfer) and a pause switch. The agent gets only a restricted key that can call `pay`, so even a hijacked agent cannot pay an unapproved address or exceed the limits.
2. Fix the known issues above (reserve spending, lock the approved quote, key trust by address, handle all swap statuses).
3. Allow / Warn / Block decisions with reasons.
4. A reproducible prompt-injection demo: an invoice carrying an attacker's address; the contract itself rejects the payment.
5. `THREAT_MODEL.md`, one-command run, seeded demo account, 2-minute video.

NEAR Intents has no testnet, so cross-chain quotes will be dry-run only.

## Try it (no keys, no funds)

Requires Node.js 22.18 or newer. No install step is needed for the offline demo and tests.

```bash
git clone https://github.com/omni6nt/trustpal-agent.git
cd trustpal-agent
npm test        # Expect: "pass 18", "fail 0"
npm run demo    # Expect: the 5 scenarios below
```

`npm run demo` runs a scripted scenario with mock payments. Do X, see Y:

| Step | Input | Expected result |
|---|---|---|
| 1 | `send $15 to my mum` | Quote shown, auto-confirmed, `COMPLETED`, Mum trust 50 -> 60 |
| 2 | `send $50 to Tunde` | `BLOCKED`: new recipient capped at $20 |
| 3 | `send $500 to Mum` | `BLOCKED`: over the per-payment and daily limits |
| 4 | `send $10 to Chidi` | "I don't have a contact called Chidi" |
| 5 | Edit a past claim on purpose | `ledger intact: true`, then `{ ok: false, brokenAt: 0 }`. This is the **intentional tamper test**: the ledger correctly detects that entry 0 was edited. |

Interactive mode with mock payments: `npm start`, then type `send $15 to Mum`.

## Live mode (experimental, not yet verified)

```bash
npm install
cp .env.example .env     # fill in ONE_CLICK_JWT and REFUND_ADDRESS, then export them
npm run quote            # dry-run quote, moves no funds
npm run live             # interactive agent
```

Live mode needs the `@defuse-protocol/one-click-sdk-typescript` package and uses mainnet only, so use tiny amounts. It has been written against the documentation but not yet tested with real swaps. Never commit your `.env` file or any keys.

## NEAR technologies

- **NEAR Intents / 1Click Swap API**: quotes, deposit addresses, swap status (`src/swap.ts`, `scripts/quote.ts`). Code written, not yet verified live.
- **Planned**: a custom NEAR policy contract with a function-call access key for the agent.

## Other tools and AI use

- Optional Claude (Anthropic API) for parsing free-form requests (`src/llm.ts`). Off by default.
- This project is written with AI assistance (Claude, ChatGPT). Code is reviewed and tested by the authors.
- Tests use Node's built-in test runner.

## Project layout

```
src/agent.ts    flow: parse -> quote -> policy -> confirm -> execute -> claim
src/policy.ts   deterministic spending rules
src/trust.ts    hash-chained claim ledger and trust score
src/swap.ts     MockProvider (offline) and IntentsProvider (live, untested)
src/parse.ts    request parser; src/llm.ts optional Claude parser
src/demo.ts     scripted demo; src/cli.ts interactive agent
test/           18 tests
```

## License

MIT
