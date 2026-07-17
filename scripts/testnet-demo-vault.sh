#!/usr/bin/env bash
# Deploys a demo cuvee whose five vintages are all already matured, buys
# allocations, closes the presale and settles the first vault. Purpose:
# record the full maturity flows (delivery, repurchase) with real on-chain
# transactions. Production testnet env is left untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_ENV="$ROOT/scripts/.deploy-demo.env"

echo "== deploy demo cuvee (vintages 2019-2023, all matured) =="
OUT_FILE="$DEMO_ENV" VINTAGES="2019 2020 2021 2022 2023" "$ROOT/scripts/deploy-testnet.sh" >/dev/null
source "$DEMO_ENV"
echo "sale $SALE_ID"

echo "== buyer setup and purchase of 2 allocations =="
KEY=terwa-user
ADDR=$(stellar keys address "$KEY")
stellar tx new change-trust --line "USDM:$ISSUER" --source "$KEY" --network "$NETWORK" >/dev/null 2>&1 || true
for CODE in $TOKEN_CODES; do
  stellar tx new change-trust --line "$CODE:$ISSUER" --source "$KEY" --network "$NETWORK" >/dev/null 2>&1 || true
done
stellar contract invoke --id "$USDM_ID" --network "$NETWORK" --source "$ISSUER_KEY" \
  -- mint --to "$ADDR" --amount 30000000000 >/dev/null
stellar contract invoke --id "$SALE_ID" --network "$NETWORK" --source "$KEY" \
  -- buy --user "$ADDR" --allocations 2 --attestation "$ATTESTATION" >/dev/null
echo "bought 2 allocations"

echo "== close presales (vaults become matured, delivery opens) =="
for V in $VAULT_IDS; do
  stellar contract invoke --id "$V" --network "$NETWORK" --source terwa-admin \
    -- close_presale >/dev/null
done

echo "== settle first vault (repurchase opens on vintage 2019) =="
FIRST=$(echo "$VAULT_IDS" | cut -d' ' -f1)
AADDR=$(stellar keys address terwa-admin)
stellar tx new change-trust --line "USDM:$ISSUER" --source terwa-admin --network "$NETWORK" >/dev/null 2>&1 || true
# repurchase pool: 2 tokens sold, 190 USDM per token
stellar contract invoke --id "$USDM_ID" --network "$NETWORK" --source "$ISSUER_KEY" \
  -- mint --to "$AADDR" --amount 3800000000 >/dev/null
stellar contract invoke --id "$FIRST" --network "$NETWORK" --source terwa-admin \
  -- settle --from "$AADDR" --amount 3800000000 >/dev/null
stellar contract invoke --id "$FIRST" --network "$NETWORK" --source terwa-admin -- get_state

echo "== frontend env for the demo shoot =="
cat > "$ROOT/frontend/.env.demo-cuvee" <<EOF
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_SALE_ID=$SALE_ID
NEXT_PUBLIC_VAULT_IDS=$(echo $VAULT_IDS | tr ' ' ',')
NEXT_PUBLIC_TOKEN_IDS=$(echo $TOKEN_IDS | tr ' ' ',')
NEXT_PUBLIC_TOKEN_CODES=$(echo $TOKEN_CODES | tr ' ' ',')
NEXT_PUBLIC_VINTAGES=$(echo $VINTAGES | tr ' ' ',')
NEXT_PUBLIC_ISSUER=$ISSUER
NEXT_PUBLIC_USDM_ID=$USDM_ID
NEXT_PUBLIC_USDM_CODE=USDM
NEXT_PUBLIC_READER_ACCOUNT=$ADMIN
EOF

echo
echo "demo ready. To shoot the video:"
echo "  cp frontend/.env.demo-cuvee frontend/.env.local && cd frontend && npm run build && npm run start -- -p 3100"
echo "  (restore afterwards with ./scripts/sync-frontend-env.sh and rebuild)"
