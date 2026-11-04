#!/usr/bin/env bash
# One-shot testnet setup for Trustpal. Run in a Linux shell (e.g. a GitHub Codespace)
# that has near-cli-rs and cargo-near installed, from the repo root.
#
#   OWNER=omni6nt-owner.testnet POLICY=omni6nt-policy2.testnet RECIPIENT=omni6nt-alex.testnet \
#   AGENT_PUBKEY=ed25519:... bash scripts/setup-testnet.sh
#
# It only ever uses the PUBLIC key of the agent. Read each step as it runs; it stops on the first error.
set -euo pipefail
: "${OWNER:?set OWNER}" "${POLICY:?set POLICY}" "${RECIPIENT:?set RECIPIENT}" "${AGENT_PUBKEY:?set AGENT_PUBKEY}"
FUND="${FUND:-5 NEAR}"            # funds the policy contract will hold
MAX="${MAX:-2000000000000000000000000}"   # 2 NEAR per payment (yoctoNEAR)
CAP="${CAP:-5000000000000000000000000}"   # 5 NEAR per day
COOLDOWN="${COOLDOWN:-120}"       # seconds before a newly approved recipient can be paid
ALLOWANCE="${ALLOWANCE:-0.25 NEAR}"

echo "== 1/7 build the contract"
(cd contract && cargo near build non-reproducible-wasm)

echo "== 2/7 create the policy account $POLICY"
near account create-account fund-myself "$POLICY" "${CREATE_FUND:-3 NEAR}" autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$OWNER" network-config testnet sign-with-legacy-keychain send

echo "== 3/7 deploy and initialise"
near contract deploy "$POLICY" use-file contract/target/near/trustpal_policy.wasm with-init-call new \
  json-args "{\"owner_id\":\"$OWNER\",\"max_per_payment\":\"$MAX\",\"daily_cap\":\"$CAP\",\"cooldown_seconds\":$COOLDOWN}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send

echo "== 4/7 fund the contract with $FUND"
near tokens "$OWNER" send-near "$POLICY" "$FUND" network-config testnet sign-with-legacy-keychain send

echo "== 5/7 approve the recipient $RECIPIENT"
near contract call-function as-transaction "$POLICY" add_recipient json-args "{\"account_id\":\"$RECIPIENT\"}" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-legacy-keychain send

echo "== 6/7 set the revenue split (50% $RECIPIENT, 20% $OWNER, 30% stays in the treasury)"
near contract call-function as-transaction "$POLICY" set_split \
  json-args "{\"shares\":[{\"account_id\":\"$RECIPIENT\",\"bps\":5000},{\"account_id\":\"$OWNER\",\"bps\":2000}]}" \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" network-config testnet sign-with-legacy-keychain send

echo "== 7/7 give the agent a key limited to 'pay' on $POLICY"
near account add-key "$OWNER" grant-function-call-access --allowance "$ALLOWANCE" --contract-account-id "$POLICY" \
  --function-names pay use-manually-provided-public-key "$AGENT_PUBKEY" network-config testnet sign-with-legacy-keychain send

echo
echo "Done. Recipient $RECIPIENT becomes payable after the ${COOLDOWN}s cooldown."
echo "Next: set POLICY_ID=$POLICY in .env, then run: npm run web -- --live"
