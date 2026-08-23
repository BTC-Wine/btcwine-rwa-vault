#!/usr/bin/env bash
# Full testnet deployment: one vault per vintage plus the allocation sale
# contract that enforces whole-allocation purchases across all vintages.
set -euo pipefail

NETWORK="testnet"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT_WASM="$ROOT/contracts/target/wasm32v1-none/release/terwa_vault.wasm"
SALE_WASM="$ROOT/contracts/target/wasm32v1-none/release/allocation_sale.wasm"
OUT="${OUT_FILE:-$ROOT/scripts/.deploy-testnet.env}"

# Placeholder economics until the producer confirms the real numbers.
# unit_price is stroops of stablecoin per token (3 bottles, 7 decimals).
UNIT_PRICE="${UNIT_PRICE:-2060000000}"    # 206 USDC, 181 EUR at 1.1383
MAX_SUPPLY="${MAX_SUPPLY:-1660}"          # tokens per vintage = allocations total
VINTAGES="${VINTAGES:-2025 2026 2027 2028 2029}"   # real vintages, delivery mi-2031
# bottles of vintage N are available june 1st of N+2 at the latest

command -v stellar >/dev/null || { echo "stellar CLI missing"; exit 1; }
[ -f "$VAULT_WASM" ] || { echo "wasm not built, run: cd contracts && stellar contract build"; exit 1; }

ATTESTATION=$(shasum -a 256 "$ROOT/legal/attestation-v1.md" | cut -d' ' -f1)

# each deploy gets its own issuer so the assets and their SACs start fresh,
# previous vaults keep the admin role of the previous SACs
ISSUER_KEY="${ISSUER_KEY:-terwa-issuer-$(date +%y%m%d%H%M)}"

ensure_key() {
  stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$NETWORK" --fund
}

echo "== identities =="
for k in terwa-admin terwa-oracle terwa-producer terwa-user "$ISSUER_KEY"; do ensure_key "$k"; done
ADMIN=$(stellar keys address terwa-admin)
# oracle and allowlist manager are the low-privilege service keys whose secrets
# live in the backend (Render). The admin key never leaves this machine.
ORACLE=$(stellar keys address "${ORACLE_SVC_KEY:-terwa-oracle-svc}")
ALLOWLIST_MANAGER=$(stellar keys address "${ALLOWLIST_SVC_KEY:-terwa-allowlist-svc}")
PRODUCER=$(stellar keys address terwa-producer)
ISSUER=$(stellar keys address "$ISSUER_KEY")
echo "admin     $ADMIN"
echo "oracle    $ORACLE"
echo "allowlist $ALLOWLIST_MANAGER"
echo "producer  $PRODUCER"
echo "issuer    $ISSUER"

echo "== stablecoin (mock for testnet, real USDC on mainnet) =="
USDM_ID=$(stellar contract asset deploy --asset "USDM:$ISSUER" --network "$NETWORK" --source "$ISSUER_KEY" 2>/dev/null \
  || stellar contract id asset --asset "USDM:$ISSUER" --network "$NETWORK")
echo "stablecoin $USDM_ID"

echo "== vintage vaults =="
VAULT_IDS=""
TOKEN_IDS=""
TOKEN_CODES=""
for V in $VINTAGES; do
  CODE="TERWA$V"
  MATURITY=$(date -j -f "%Y-%m-%d" "$((V + 2))-06-01" +%s)
  TOKEN_ID=$(stellar contract asset deploy --asset "$CODE:$ISSUER" --network "$NETWORK" --source "$ISSUER_KEY" 2>/dev/null \
    || stellar contract id asset --asset "$CODE:$ISSUER" --network "$NETWORK")
  VAULT_ID=$(stellar contract deploy \
    --wasm "$VAULT_WASM" \
    --network "$NETWORK" \
    --source terwa-admin \
    -- \
    --admin "$ADMIN" \
    --vault_token "$TOKEN_ID" \
    --stablecoin "$USDM_ID" \
    --oracle "$ORACLE" \
    --maturity_ts "$MATURITY" \
    --unit_price "$UNIT_PRICE" \
    --max_supply "$MAX_SUPPLY" \
    --bundle_lots 1 \
    --attestation "$ATTESTATION" 2>/dev/null | tail -1)
  stellar contract invoke --id "$TOKEN_ID" --network "$NETWORK" --source "$ISSUER_KEY" \
    -- set_admin --new_admin "$VAULT_ID" >/dev/null 2>&1
  echo "$V  token $TOKEN_ID  vault $VAULT_ID  (available $((V + 2))-06-01)"
  VAULT_IDS="$VAULT_IDS $VAULT_ID"
  TOKEN_IDS="$TOKEN_IDS $TOKEN_ID"
  TOKEN_CODES="$TOKEN_CODES $CODE"
done
VAULT_IDS=$(echo "$VAULT_IDS" | xargs)
TOKEN_IDS=$(echo "$TOKEN_IDS" | xargs)
TOKEN_CODES=$(echo "$TOKEN_CODES" | xargs)

echo "== allocation sale =="
VAULTS_JSON=$(printf '"%s",' $VAULT_IDS); VAULTS_JSON="[${VAULTS_JSON%,}]"
SALE_ID=$(stellar contract deploy \
  --wasm "$SALE_WASM" \
  --network "$NETWORK" \
  --source terwa-admin \
  -- \
  --admin "$ADMIN" \
  --vaults "$VAULTS_JSON" 2>/dev/null | tail -1)
echo "sale $SALE_ID"

echo "== wiring: router, allowlist manager and exit check =="
for VAULT_ID in $VAULT_IDS; do
  # deposits only through the sale contract
  stellar contract invoke --id "$VAULT_ID" --network "$NETWORK" --source terwa-admin \
    -- set_router --router "$SALE_ID" >/dev/null
  # the KYC backend key manages the allowlist, never the admin key
  stellar contract invoke --id "$VAULT_ID" --network "$NETWORK" --source terwa-admin \
    -- set_allowlist_manager --manager "$ALLOWLIST_MANAGER" >/dev/null
  # KYC required at exit (redeem and physical claim)
  stellar contract invoke --id "$VAULT_ID" --network "$NETWORK" --source terwa-admin \
    -- set_exit_check --required true >/dev/null
done

echo "== smoke check =="
FIRST_VAULT=$(echo "$VAULT_IDS" | cut -d' ' -f1)
stellar contract invoke --id "$FIRST_VAULT" --network "$NETWORK" --source terwa-admin -- get_state
stellar contract invoke --id "$SALE_ID" --network "$NETWORK" --source terwa-admin -- get_vaults | head -1

cat > "$OUT" <<EOF
NETWORK=$NETWORK
ADMIN=$ADMIN
ORACLE=$ORACLE
ALLOWLIST_MANAGER=$ALLOWLIST_MANAGER
PRODUCER=$PRODUCER
ISSUER=$ISSUER
ISSUER_KEY=$ISSUER_KEY
USDM_ID=$USDM_ID
SALE_ID=$SALE_ID
VAULT_IDS="$VAULT_IDS"
TOKEN_IDS="$TOKEN_IDS"
TOKEN_CODES="$TOKEN_CODES"
VINTAGES="$VINTAGES"
ATTESTATION=$ATTESTATION
UNIT_PRICE=$UNIT_PRICE
MAX_SUPPLY=$MAX_SUPPLY
EOF
echo "written $OUT"
