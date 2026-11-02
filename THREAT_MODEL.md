# Threat model

What Trustpal Agent defends against, what it does not, and how each claim can be checked.

## The setup

- **Owner account** `omni6nt-owner.testnet` holds the full-access key. It stays offline from the agent.
- **Policy contract** `omni6nt-policy.testnet` holds the funds and enforces the rules on chain.
- **Agent key** is a NEAR *function-call* key added to the owner account. It can only call `pay` on the policy contract, and has a small gas allowance. It lives in `.env` and is never printed.
- **The agent** (LLM or script) reads untrusted input such as invoices and chat, and proposes payments.

**Core rule:** the AI proposes, the contract decides. Nothing the AI is told can widen what its key may do.

## Threats and defences

| # | Threat | Defence | How to check it |
|---|---|---|---|
| 1 | Prompt injection: an invoice tells the agent to pay an attacker | Off-chain guard refuses (blocklist + not approved). If the guard is bypassed, the contract rejects: recipient is not on the approved list | `npm run attack` or the web demo, buttons 2 and 3 |
| 2 | Agent overspends | Contract enforces a per-payment cap and a daily cap. Spend is reserved before the transfer | Web demo button 4; `contract` unit tests |
| 3 | Stolen or hijacked agent key | The key cannot send NEAR, add keys or call other methods or contracts. Worst case is bounded by the contract limits and a pause switch | `npm run key-limits` (4 forbidden actions refused by the NEAR RPC) |
| 4 | Double payment / replay | Each payment reference can be used once | Contract unit test `already used` |
| 5 | Concurrent payments racing past the daily cap | The cap is reserved atomically inside the contract before the transfer; a failed transfer releases it in a callback | Contract unit tests |
| 6 | Tampered audit history | Audit log is hash-chained; editing an entry breaks verification | `npm test`, `npm run demo` (tamper test) |
| 7 | Typo or look-alike address | Only addresses the owner approved on chain can be paid | Contract `pay` check |

## What is NOT defended (be sceptical of anything beyond this table)

- **A compromised owner key.** The owner can approve any address and change limits. Keep it cold.
- **Approving the wrong address.** If the owner approves an attacker's address, the contract will pay it. The check is "approved by the owner", not "is this person honest".
- **Payments up to the limits.** A hijacked agent can still pay approved recipients up to the per-payment and daily caps.
- **Counterparty reputation.** The check uses the owner's approved list, a local blocklist with evidence, and our own history with the exact address. It has no global scam database and no on-chain age or code-hash signals yet.
- **Smart-contract bugs.** The policy contract is small and has 10 unit tests, but it is unaudited.
- **Fungible tokens and stablecoins.** Only native NEAR is supported. NEP-141 is not built.
- **Cross-chain payments.** NEAR Intents has no testnet, and its code in `src/swap.ts` has never been tested live. It is not part of the enforced path.
- **The gullible agent in the demo is scripted.** It stands for a manipulated AI; no LLM is used in `npm run attack`.

## Verified on NEAR testnet

- Contract deployed and used for real payments from `omni6nt-policy.testnet` to `omni6nt-alex.testnet`.
- Real rejections by the contract: unapproved recipient, over per-payment limit.
- Real rejections by the NEAR RPC for the agent key: direct transfer, add key, wrong method, wrong contract.
