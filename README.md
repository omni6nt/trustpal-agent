# Trustpal Agent

**An AI payments agent for cross-border remittances on NEAR Intents, with hard spending limits and a tamper-evident trust ledger.**

Built for NEAR HACKATHON (Nov 2026). Track: **Real-World Money** (remittances), with safeguards in the spirit of AI Security & Defense.

## The problem

Sending money to family in Nigeria is slow and expensive, and giving an AI agent control of money is scary. Trustpal Agent shows how to do both safely: you say what you want in plain language, and the agent does the work, but it can never move money outside rules you set.

## What it does

1. You type: `send $15 to my mum`
2. The agent parses the request, finds the contact, and gets a quote through **NEAR Intents (1Click Swap API)**.
3. A deterministic **policy engine** checks it: per-payment limit, daily limit, max fee, recipient trust score, and a low cap for brand-new recipients.
4. You see fee, amount received, ETA and trust score, and must **confirm**.
5. After the swap, the outcome is written as a **claim** to a hash-chained ledger. Each recipient's trust score is computed from their claims, and editing history is detectable.

### Design principles

- **The AI never has authority.** The optional Claude parser only turns text into `{amount, recipient}`. `src/policy.ts` decides if a payment is allowed, and the user confirms. A prompt injection can change what is *requested*, not what is *permitted*.
- **The agent never holds keys.** In live mode it requests a quote and gives you a deposit address; you send funds yourself and the agent watches the swap status.
- **Everything is verifiable.** Claims are append-only and hash-chained (`src/trust.ts`).

## Try it in 60 seconds (no keys, no funds)

Requires Node.js >= 22.18.

```bash
git clone <this-repo-url> && cd trustpal-agent
npm test        # Expect: 18 tests pass
npm run demo    # Expect: the 5 scenarios below
```

`npm run demo` runs a scripted scenario. Do X, see Y:

| Step | Input | Expected result |
|---|---|---|
| 1 | `send $15 to my mum` | Quote shown, auto-confirmed, `COMPLETED`, Mum trust 50 -> 60 |
| 2 | `send $50 to Tunde` | `BLOCKED`: new recipient capped at $20 |
| 3 | `send $500 to Mum` | `BLOCKED`: over per-payment and daily limits |
| 4 | `send $10 to Chidi` | "I don't have a contact called Chidi" |
| 5 | Edit a past claim | `ledger intact: true`, then `{ ok: false, brokenAt: 0 }` |

Interactive mode (mock swaps, you confirm each payment): `npm start`, then type `send $15 to Mum`.

## Live mode (real NEAR Intents swaps)

```bash
npm install
cp .env.example .env        # fill in ONE_CLICK_JWT and REFUND_ADDRESS, then export them
# edit contacts.json with real addresses (chain codes as listed by OneClickService.getTokens())
npm run quote               # dry-run quote, moves no funds
npm run live                # interactive agent; you send the deposit it asks for
```

Notes:
- NEAR Intents has no testnet, so use small amounts (about $1).
- A 1Click JWT is needed for quotes; request one via the form linked in the SDK docs.
- The naira figure shown to the user is **indicative** (`NGN_PER_USD`). Intents moves value across chains; converting to naira is done by the recipient through a local exchange or P2P. Integrating an off-ramp is future work.

## NEAR technologies used

- **NEAR Intents / 1Click Swap API** (`@defuse-protocol/one-click-sdk-typescript`): quotes, deposit addresses, execution status (`src/swap.ts`, `scripts/quote.ts`).

## Other tools and AI usage

- Optional **Claude** (Anthropic API) for parsing free-form requests (`src/llm.ts`). Off by default; a regex parser is the fallback.
- This project was written with AI assistance (Claude). All code is reviewed and tested by the author.
- Node.js built-in test runner; no other runtime dependencies.

## Project layout

```
src/agent.ts    orchestration: parse -> quote -> policy -> confirm -> execute -> claim
src/policy.ts   deterministic spending rules
src/trust.ts    hash-chained claim ledger + trust score
src/swap.ts     MockProvider (offline) and IntentsProvider (live)
src/parse.ts    fallback intent parser; src/llm.ts optional Claude parser
src/demo.ts     scripted demo; src/cli.ts interactive agent
test/           18 tests
```

## Limitations and roadmap

- Live mode has been written against the 1Click docs but needs more testing with real swaps.
- Claims are stored locally. Next: anchor ledger hashes on NEAR so trust scores are publicly verifiable.
- Next: function-call keys so the agent can pay within an on-chain allowance, and a naira off-ramp partner.

## License

MIT
