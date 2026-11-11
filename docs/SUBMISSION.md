# Submission pack (drafts: confirm every field against the live form before sending)

Re-read https://nearhackathon.com/HACKATHON.md right before submitting. One submission only; mistakes go through nearhackathon.com/request-changes.

## Fields
| Field | Value |
|---|---|
| projectName (2-80) | Trustpal |
| leadName | (Omni confirms) |
| email | (Omni confirms) |
| size | `2 - 4` (confirm the team) |
| tracks | `business`, `security` |
| nearAddress (mainnet) | omni6nt.near |
| projectUrl | https://github.com/omni6nt/trustpal-agent (must be public, with LICENSE) |
| demoUrl | the X post URL (video attached, says built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon) |
| requestId | a fresh UUID; save the response |
| consent | true |

## Idea text (20-2000 characters)
Trustpal is a business treasury that an AI can help run but cannot rob. Small businesses want AI to read invoices and prepare payments, but an AI that can be tricked by text hidden in an invoice must never be the thing that decides where money goes.

How it works: an AI reads an invoice and proposes a payment. Trustpal checks it: an amount that does not match the invoice total, or a payee not on the owner's list, is held for the owner. The owner approves an exact payment (reference, recipient, amount, expiry) in their NEAR wallet, or lets the AI pay people already on the list within limits they set. The final authority is a policy contract on NEAR: the AI holds only a function-call key limited to the `pay` method, so it cannot change the rules, approve its own payments, add keys or call anything else. The contract enforces a per-payment limit and a daily cap on every route, rejects duplicate references, and can be paused. Client payments are split by on-chain rules, and a hash-chained activity log records what happened.

What is real: a policy contract on NEAR testnet, a restricted agent key, wallet-signed exact approvals, and a Security lab that tries to rob the business (poisoned invoice, fraud on an approved invoice, look-alike address, guard switched off, over the limit, replay). We also red-teamed the invoice reader with a real model (Gemini) over 23 hand-written invoices: the model is sometimes fooled, and a later layer stopped every case; no money moved wrongly. Practice mode lets anyone set their own rules with no wallet and no money. The live treasury is one configured demo business; self-serve treasuries are next. Testnet only, not audited.

## Pre-submit checklist
- [ ] Repo public, LICENSE present, no secrets (`git log -p | grep -i "private\|secret"` is clean; `.env` is ignored)
- [ ] README path works on a clean clone (`bash scripts/fresh-clone-check.sh`)
- [ ] `npm test` green; `npm run verify-live` output saved; `evidence/` has the real red-team files
- [ ] Video uploaded to the X post; post says it was built at NEAR HACKATHON and tags @NEARProtocol and #NEARHackathon
- [ ] Policy account frozen (or documented why not); practice freeze rehearsed first
- [ ] Every field above confirmed by Omni; HACKATHON.md re-read today
