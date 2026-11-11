# Threat model

Design rule: assume the AI will be fooled and its key will leak. Limit the damage by construction.

## What we protect

The treasury held by the policy contract, and the owner's rules (limits, payees, approvals, split, pause).

## Who we assume can be hostile

- Anyone who can put text in front of the AI (invoice authors). Today the app accepts pasted invoice text only; there is no email, web-page or PDF intake, so those would be future attack surfaces.
- Anyone who steals the agent key.
- The AI itself, if manipulated.

## Who we trust

- The owner and the owner's full-access key.
- NEAR's enforcement of function-call key permissions.
- The contract code (unaudited; see limits).
- Whoever holds the policy account's own full-access key. It was used to deploy the contract and can redeploy it, bypassing every rule. Delete that key after deployment to freeze the code.

## Attacks and defences

| Attack | Defence | Where enforced | Proven |
| --- | --- | --- | --- |
| Prompt injection in an invoice | Guard checks the payee; contract needs an approval or a listed payee | Guard, contract | Live and offline |
| Approved reference reused with another address | Contract requires the exact approved recipient, amount, reference and expiry | Contract | Live |
| Guard bypassed | Contract still rejects unapproved payments | Contract | Live |
| Look-alike address | Guard flags near matches; contract rejects unapproved addresses anyway | Guard, contract | Guard live |
| Replay of a paid invoice | References are single-use | Contract | Live |
| Stolen agent key | Key can only call `pay`; limits and approvals still apply | NEAR key permissions, contract | Live (6 of 6 refused; script re-hardened) |
| Oversized payment | Per-payment limit | Contract | Offline, unit tests |
| Drain by many small payments | Daily limit with reservation before transfer | Contract | Unit tests |
| Instantly paying a brand-new payee | New-payee wait | Contract | Unit tests |
| Editing a logged entry | Hash chain no longer verifies | Application | Offline tests. Not covered: deleting the newest entries, or rewriting the whole log and its hashes. The log is not on-chain. |
| A person or program that can reach the local dashboard without the owner's session | Live mode needs the private sign-in link, a session cookie and a Host check; warnings are never auto-approved in live mode (including the Security lab) | Dashboard server | Offline tests (`test/web-lock.test.ts`) |
| A hostile page frames the dashboard to trick a click | `X-Frame-Options: DENY` and `frame-ancestors 'none'` | Dashboard server | Offline test |
| A website open in the owner's browser calls the local dashboard | Host and Origin checks refuse other sites and DNS rebinding | Dashboard server | Offline tests (`test/web.test.ts`) |

## Out of scope

- Theft of the owner's full-access key. Next step: hardware wallet or multisig owner.
- Bugs in the contract that an audit would find. No audit has been done.
- Mainnet risks, stablecoin risks (not built).
- Failed or expired payments: a failed transfer releases the daily reservation but keeps its invoice reference used, and an expired approval keeps its reference until cancelled. The owner issues a new reference. This is safe but inconvenient.
- Failed revenue-share transfers: the contract does not record whether each share arrived (no callback). It relies on NEAR returning an undelivered amount to the contract; this was not tested.
- A broad measurement of how often a real model is fooled: `npm run redteam` covers 23 hand-written invoices only (results in `evidence/`).

Full detail and evidence: [DEFENCE_NOTE.md](DEFENCE_NOTE.md).
