#!/usr/bin/env bash
# Freeze the policy contract by deleting the policy account's own full-access key(s).
# After this nobody can redeploy or change the contract code. It cannot be undone.
# Practice on the fallback deployment (omni6nt-policy2.testnet) first.
#
#   POLICY=omni6nt-policy2.testnet scripts/freeze-contract.sh list
#   POLICY=omni6nt-policy2.testnet scripts/freeze-contract.sh delete ed25519:THE_FULL_ACCESS_KEY
set -euo pipefail
: "${POLICY:?set POLICY, for example POLICY=omni6nt-policy2.testnet}"
case "${1:-}" in
  list)
    near account list-keys "$POLICY" network-config testnet now
    echo
    echo "Delete the key whose permission is FullAccess. The policy account has no function-call keys."
    ;;
  delete)
    key="${2:?pass the public key to delete, like ed25519:...}"
    near account delete-keys "$POLICY" public-keys "$key" network-config testnet sign-with-legacy-keychain send
    ;;
  *) echo "usage: freeze-contract.sh list | delete <public-key>"; exit 1 ;;
esac
