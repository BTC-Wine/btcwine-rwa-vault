#!/usr/bin/env bash
# End-to-end validation of the Bloc 2 contract features on a local Stellar
# network (stellar/quickstart with --local). Exercises extend_maturity, the
# repeatable settle and the allowlist manager role against a real network,
# never the public testnet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT_WASM="$ROOT/contracts/target/wasm32v1-none/release/terwa_vault.wasm"
NET="local"
RPC="http://localhost:8000/rpc"
PASSPHRASE="Standalone Network ; February 2017"

command -v stellar >/dev/null || { echo "stellar CLI missing"; exit 1; }
[ -f "$VAULT_WASM" ] || { echo "wasm not built, run: cd contracts && stellar contract build"; exit 1; }
curl -sf "$RPC" -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null \
  || { echo "local network not reachable on $RPC (docker run stellar/quickstart --local)"; exit 1; }

stellar network add "$NET" --rpc-url "$RPC" --network-passphrase "$PASSPHRASE" 2>/dev/null || true

fail() { echo "FAIL: $1"; exit 1; }
must_fail() { # runs an invoke that is expected to be rejected
  local msg="$1"; shift
  if "$@" >/dev/null 2>&1; then fail "$msg"; fi
  echo "ok (rejected as expected): $msg"
}

echo "== identities =="
# fresh issuer per run so the assets and their SAC admins start clean
ISSUER_KEY="lv-issuer-$(date +%s)"
stellar keys generate "$ISSUER_KEY" --network "$NET" --fund
for k in lv-admin lv-oracle lv-producer lv-user lv-kyc; do
  stellar keys address "$k" >/dev/null 2>&1 || stellar keys generate "$k" --network "$NET" --fund
done
ADMIN=$(stellar keys address lv-admin)
ORACLE=$(stellar keys address lv-oracle)
PRODUCER=$(stellar keys address lv-producer)
USER=$(stellar keys address lv-user)
ISSUER=$(stellar keys address "$ISSUER_KEY")
KYC=$(stellar keys address lv-kyc)

invoke() { # invoke <source> <contract> <fn> [args...]
  local src="$1" id="$2"; shift 2
  stellar contract invoke --id "$id" --network "$NET" --source "$src" -- "$@"
}

echo "== assets =="
USDM=$(stellar contract asset deploy --asset "USDM:$ISSUER" --network "$NET" --source "$ISSUER_KEY" 2>/dev/null \
  || stellar contract id asset --asset "USDM:$ISSUER" --network "$NET")
TOKEN=$(stellar contract asset deploy --asset "TERWALV:$ISSUER" --network "$NET" --source "$ISSUER_KEY" 2>/dev/null \
  || stellar contract id asset --asset "TERWALV:$ISSUER" --network "$NET")

echo "== vault (maturity in 45s) =="
ATT=$(shasum -a 256 "$ROOT/legal/attestation-v1.md" | cut -d' ' -f1)
NOW=$(date +%s)
MATURITY=$((NOW + 45))
EXTENDED=$((NOW + 90))
VAULT=$(stellar contract deploy --wasm "$VAULT_WASM" --network "$NET" --source lv-admin -- \
  --admin "$ADMIN" --vault_token "$TOKEN" --stablecoin "$USDM" --oracle "$ORACLE" \
  --maturity_ts "$MATURITY" --unit_price 100 --max_supply 100 --bundle_lots 1 \
  --attestation "$ATT" 2>/dev/null | tail -1)
invoke "$ISSUER_KEY" "$TOKEN" set_admin --new_admin "$VAULT" >/dev/null
echo "vault $VAULT"

echo "== presale: deposit 3 lots =="
stellar tx new change-trust --line "USDM:$ISSUER" --source lv-user --network "$NET" >/dev/null 2>&1 || true
stellar tx new change-trust --line "TERWALV:$ISSUER" --source lv-user --network "$NET" >/dev/null 2>&1 || true
stellar tx new change-trust --line "USDM:$ISSUER" --source lv-producer --network "$NET" >/dev/null 2>&1 || true
invoke "$ISSUER_KEY" "$USDM" mint --to "$USER" --amount 10000 >/dev/null
invoke "$ISSUER_KEY" "$USDM" mint --to "$PRODUCER" --amount 10000 >/dev/null
invoke lv-user "$VAULT" deposit --user "$USER" --lots 3 --attestation "$ATT" >/dev/null
invoke lv-admin "$VAULT" close_presale >/dev/null

echo "== extend_maturity =="
must_fail "shortening must be rejected" \
  stellar contract invoke --id "$VAULT" --network "$NET" --source lv-admin -- \
  extend_maturity --new_maturity "$NOW"
invoke lv-admin "$VAULT" extend_maturity --new_maturity "$EXTENDED" >/dev/null
GOT=$(invoke lv-admin "$VAULT" get_maturity)
[ "$GOT" = "\"$EXTENDED\"" ] || [ "$GOT" = "$EXTENDED" ] || fail "maturity not extended (got $GOT)"

echo "== waiting past the original maturity (50s), lock must hold =="
sleep 50
STATE=$(invoke lv-admin "$VAULT" get_state)
echo "$STATE" | grep -q Locked || fail "expected Locked after extension, got $STATE"
echo "ok: still Locked after original maturity"

echo "== waiting for the extended maturity =="
sleep 45
STATE=$(invoke lv-admin "$VAULT" get_state)
echo "$STATE" | grep -q Matured || fail "expected Matured, got $STATE"

echo "== repeatable settle =="
# settle requires the admin and the funds source to sign; the CLI signs for
# one account, so the admin fronts the funds here (same as the demo script)
stellar tx new change-trust --line "USDM:$ISSUER" --source lv-admin --network "$NET" >/dev/null 2>&1 || true
invoke "$ISSUER_KEY" "$USDM" mint --to "$ADMIN" --amount 10000 >/dev/null
invoke lv-admin "$VAULT" settle --from "$ADMIN" --amount 300 >/dev/null
P1=$(invoke lv-user "$VAULT" redeem --user "$USER" --lots 1)
[ "$P1" = "\"100\"" ] || fail "first payout expected 100, got $P1"
invoke lv-admin "$VAULT" settle --from "$ADMIN" --amount 150 >/dev/null
POOL=$(invoke lv-admin "$VAULT" get_settled_pool)
[ "$POOL" = "\"450\"" ] || fail "pool expected 450 after second settle, got $POOL"
P2=$(invoke lv-user "$VAULT" redeem --user "$USER" --lots 1)
[ "$P2" = "\"150\"" ] || fail "second payout expected 150, got $P2"
echo "ok: settle repeatable, payouts 100 then 150 on a growing pool"

echo "== allowlist manager role =="
invoke lv-admin "$VAULT" set_exit_check --required true >/dev/null
must_fail "redeem must be gated when exit check is on" \
  stellar contract invoke --id "$VAULT" --network "$NET" --source lv-user -- \
  redeem --user "$USER" --lots 1
invoke lv-admin "$VAULT" set_allowlist_manager --manager "$KYC" >/dev/null
must_fail "admin key must be refused on set_allowed once a manager is set" \
  stellar contract invoke --id "$VAULT" --network "$NET" --source lv-admin -- \
  set_allowed --addr "$USER" --status true
invoke lv-kyc "$VAULT" set_allowed --addr "$USER" --status true >/dev/null
P3=$(invoke lv-user "$VAULT" redeem --user "$USER" --lots 1)
[ "$P3" = "\"150\"" ] || fail "post-allowlist payout expected 150, got $P3"
echo "ok: manager key manages the allowlist, admin key rejected"

echo "== settled vault is final =="
must_fail "extend after settlement must be rejected" \
  stellar contract invoke --id "$VAULT" --network "$NET" --source lv-admin -- \
  extend_maturity --new_maturity $((EXTENDED + 1000))

echo
echo "ALL CHECKS PASSED"
