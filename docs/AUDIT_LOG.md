# Review log

Trustpal has been reviewed by several independent AI security reviewers (separate chats, each given the repository). It has **not** been audited by a professional security firm. Findings that were real are fixed; the rest are listed with the reason.

| Finding | Status |
|---|---|
| A fooled AI could redirect a payment to a different payee already on the owner's list (the reader checked the amount, not the payee) | **Fixed.** `reconcile` now holds any proposal whose payee is not the one payee the invoice names. Unit tests cover two listed payees. |
| A tampered local log was restored as "paid" after a restart | **Fixed.** The log is verified on load. If it fails, earlier sessions are not shown. An unreadable line also counts as tampering. |
| The payment page sent `receive_revenue` to any account in the URL | **Fixed.** The page only pays the Trustpal contract and refuses other links. |
| The freeze script had no safety checks | **Fixed.** It refuses an owner account and needs `CONFIRM_FREEZE=yes`. |
| The deployed-code check could not be reproduced by a judge's own build | **Fixed.** The exact deployed bytecode is kept in `contract/deployed/`, and `verify-live` compares against it. |
| Documentation overstated "only the contract can move money", split behaviour, and red-team scope | **Fixed.** Wording corrected in the README and defence note. |
| Owner-approved payments are not capped by the per-payment limit | Documented by design (daily cap still applies). |
| The policy account's full-access key can redeploy the contract | Documented. The key is deleted at the end of the hackathon (`scripts/freeze-contract.sh`). |
| Approvals do not reserve funds; pause does not stop incoming revenue | Documented. |
| The live demo fires real attack calls with the agent key; `DASHBOARD_LOCK=off` | Documented. The contract refuses the attacks; the lock is on by default in live mode. |
| Gas and storage growth by a looping agent key; unbounded approval list | Accepted for a testnet prototype; first items for a production version. |
