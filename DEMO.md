# Judge demo path (about 5 minutes)

Two ways to see Trustpal. Start with A: it needs nothing but Node 22.18 or newer (`node --version`).

## A. Practice mode (no wallet, no network)

```bash
npm install
npm test            # 32 tests should pass
npm run attack      # the attack suite against the offline chain
npm run web         # open http://localhost:3000
```

In the dashboard, open **Security lab**, then:

1. **Run all five** attacks. Watch each one travel down the four gates on the right and stop where it is caught. The poisoned invoice and the look-alike address stop at Guard. The bypass, fraud and over-the-limit attacks stop at Owner's rules.
2. Run **Pay the approved invoice**. It passes all four gates and is stamped Paid.
3. Run **Replay a paid invoice**. The contract rejects the reused reference.
4. Open **Owner settings** and change the revenue split, the limits or the payee list. In practice mode changes apply instantly. Run an attack again to see the new rules in action.

Practice mode is a simulation of the contract's rules on your computer. It is labelled as such on every screen.

## B. The live testnet path

This is what was run on NEAR testnet. A judge cannot run it against our deployment (the agent key is private), but every result can be checked, and the whole deployment can be rebuilt with `scripts/setup-testnet.sh`.

Deployment: owner `omni6nt-owner.testnet`, policy contract `omni6nt-policy3.testnet`, contractor `omni6nt-alex.testnet`.

Order of the live run:

1. The owner approves one exact invoice, from the owner's terminal:
   ```bash
   POLICY=omni6nt-policy3.testnet OWNER=omni6nt-owner.testnet bash scripts/owner.sh approve INV-2001 omni6nt-alex.testnet 0.5 7200
   ```
2. `npm run web -- --live`, then in Security lab run **Fraud on an approved invoice**. Refused by the guard, and rejected by the contract.
3. Run **Pay the approved invoice**. Paid exactly as approved, confirmed by the contract.
4. Run **Replay a paid invoice**. Rejected: reference already used.
5. `npm run key-limits`. Six forbidden actions are tried with the AI's key. The script first prints the key's real permission from the network, and counts only genuine NEAR permission errors as refusals; a network failure is reported as inconclusive.
6. Client payment and split: `bash scripts/owner.sh client-pay 1 INV-3001`. The contract logs 0.5 to the contractor, 0.2 to the owner, 0.3 kept.

Transaction ids from the recorded run, searchable on a NEAR testnet explorer:

| Step | Transaction |
| --- | --- |
| Owner approval | `9R4dmtVCNTSZrFYtkYsRd9RXVL6FL1N84GcVUyxDyARc` |
| Client payment and split | `DFi5dtV6LWfNj82btq4htwYY8nX28aqAyrg6sp5ZnCxh` |
| Deployment | `4LhLL7Qcyy93sGF2Dpn6sg3ek3iaX8Ni5UDhJvbLeSB6` |

Read the contract directly:

```bash
near contract call-function as-read-only omni6nt-policy3.testnet get_policy json-args {} network-config testnet now
```

## What the demo does not show

Mainnet, stablecoins, wallet-signed approvals and login. See the honest limits in `DEFENCE_NOTE.md`.

## Approve from the dashboard with a wallet (testnet)

The dashboard can send the owner's approval itself. The page never sees a private key: the wallet signs.

1. Open the dashboard, go to **Approvals**, press **Connect wallet**, and pick Meteor or MyNearWallet (switch the wallet to **testnet** first).
2. A wallet that is not the owner account connects as **View only**. It can look around, and the contract would refuse its approvals.
3. The owner account (`omni6nt-owner.testnet`) connects as **Owner**. Fill in the invoice, payee and amount, press **Review and approve**, check every line, then **Confirm in my wallet**.
4. This is a real testnet transaction even when the dashboard is in practice mode. The link under the form opens it on the NEAR testnet explorer.
5. Rebuild the wallet code after changing `wallet/wallet.js` with `npm run build:wallet`.

Tested live: the owner wallet approved INV-3001 (tx `8A3GvjATXMAp9p4k4XbALSScGtrGTWJA6mPS3YYASFHL`), and `get_approval` on the contract returned the exact recipient, amount and expiry.

Cancel also tested live (tx `9pxqQH9RVkFSb2iDrsjcccKBe9knut6EmFbfdbTiwyrn`). In live mode the full loop is: approve in the wallet, then press **Pay the approved invoice** in the Security lab; the AI pays exactly the approved invoice.

Safety notes: sign-in asks the wallet for a key limited to the read method `get_policy`, so the page holds no key that can approve or pay. Check this under the owner account's **Access Keys** on the explorer. Every approval opens your wallet for a fresh confirmation.
