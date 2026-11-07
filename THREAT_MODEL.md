# Threat model

Design rule: assume the AI will be fooled and its key will leak. Limit the damage by construction.

## What we protect

The treasury held by the policy contract, and the owner's rules (limits, payees, approvals, split, pause).

## Who we assume can be hostile

- Anyone who can put text in front of the AI (invoice authors, email senders, web pages).
- Anyone who steals the agent key.
- The AI itself, if manipulated.

## Who we trust

- The owner and the owner's full-access key.
- NEAR's enforcement of function-call key permissions.
- The contract code (unaudited; see limits).

## Attacks and defences

| Attack | Defence | Where enforced | Proven |
| --- | --- | --- | --- |
| Prompt injection in an invoice | Guard checks the payee; contract needs an approval or a listed payee | Guard, contract | Live and offline |
| Approved reference reused with another address | Contract requires the exact approved recipient, amount, reference and expiry | Contract | Live |
| Guard bypassed | Contract still rejects unapproved payments | Contract | Live |
| Look-alike address | Guard flags near matches; contract rejects unapproved addresses anyway | Guard, contract | Guard live |
| Replay of a paid invoice | References are single-use | Contract | Live |
| Stolen agent key | Key can only call `pay`; limits and approvals still apply | NEAR key permissions, contract | Live (6 of 6 refused) |
| Oversized payment | Per-payment limit | Contract | Offline, unit tests |
| Drain by many small payments | Daily limit with reservation before transfer | Contract | Unit tests |
| Instantly paying a brand-new payee | New-payee wait | Contract | Unit tests |
| Tampering with history | Hash-chained activity log | Application | Offline tests |

## Out of scope

- Theft of the owner's full-access key. Next step: hardware wallet or multisig owner.
- Bugs in the contract that an audit would find. No audit has been done.
- Mainnet risks, stablecoin risks (not built).
- Measuring how often a real model is fooled (needs a red-team run).

Full detail and evidence: [DEFENCE_NOTE.md](DEFENCE_NOTE.md).
