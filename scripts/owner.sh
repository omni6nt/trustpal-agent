#!/usr/bin/env bash
# Owner actions. These need the OWNER's full-access key (Codespace keychain), never the agent's key.
# The agent software cannot do any of this. Run from a shell with near-cli-rs.
#
#   POLICY=omni6nt-policy3.testnet OWNER=omni6nt-owner.testnet bash scripts/owner.sh <command> ...
#
#   approve  REF RECIPIENT AMOUNT_NEAR [SECONDS]   authorise one exact payment (default 1 hour)
#   cancel   REF                                   withdraw an approval
#   split    ACCOUNT:BPS ACCOUNT:BPS ...           set the revenue split (bps total at most 10000; the rest stays in the treasury)
#   client-pay AMOUNT_NEAR MEMO                    pay the business (anyone can); money is split at once
#   pause | unpause                                kill switch
set -euo pipefail
: "${POLICY:?set POLICY}" "${OWNER:?set OWNER}"
cmd="${1:-}"; shift || true
yocto() { node -e 'const [w,f=""]=process.argv[1].split(".");console.log((BigInt(w)*10n**24n+BigInt(f.padEnd(24,"0").slice(0,24))).toString())' "$1"; }
call() { # method json deposit
  near contract call-function as-transaction "$POLICY" "$1" json-args "$2" prepaid-gas '60.0 Tgas' attached-deposit "$3" \
    sign-as "$OWNER" network-config testnet sign-with-legacy-keychain send
}
case "$cmd" in
  approve)
    ref="$1"; to="$2"; amt="$(yocto "$3")"; secs="${4:-3600}"
    call approve_payment "{\"reference\":\"$ref\",\"recipient\":\"$to\",\"amount\":\"$amt\",\"valid_for_seconds\":$secs}" '0 NEAR' ;;
  cancel)
    call cancel_approval "{\"reference\":\"$1\"}" '0 NEAR' ;;
  split)
    json="["; first=1
    for pair in "$@"; do
      [ $first -eq 1 ] || json+=","; first=0
      json+="{\"account_id\":\"${pair%%:*}\",\"bps\":${pair##*:}}"
    done
    call set_split "{\"shares\":$json]}" '0 NEAR' ;;
  client-pay)
    call receive_revenue "{\"memo\":\"$2\"}" "$1 NEAR" ;;
  pause)   call set_paused '{"paused":true}' '0 NEAR' ;;
  unpause) call set_paused '{"paused":false}' '0 NEAR' ;;
  *) echo "usage: owner.sh approve|cancel|split|client-pay|pause|unpause ..."; exit 1 ;;
esac
