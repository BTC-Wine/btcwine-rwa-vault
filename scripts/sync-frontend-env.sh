#!/usr/bin/env bash
# Regenerates frontend/.env.local from the latest testnet deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/.deploy-testnet.env"

cat > "$ROOT/frontend/.env.local" <<EOF
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
echo "written frontend/.env.local"
