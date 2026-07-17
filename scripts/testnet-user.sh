#!/usr/bin/env bash
# Prepares a funded testnet buyer: account, trustlines, mock stablecoin.
# Usage: ./scripts/testnet-user.sh [key-name] [usdm-amount-stroops]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/.deploy-testnet.env"

KEY="${1:-terwa-user}"
AMOUNT="${2:-15000000000}"

stellar keys address "$KEY" >/dev/null 2>&1 || stellar keys generate "$KEY" --network "$NETWORK" --fund
ADDR=$(stellar keys address "$KEY")

# classic assets need a trustline before the account can hold them
stellar tx new change-trust --line "USDM:$ISSUER" --source "$KEY" --network "$NETWORK" >/dev/null 2>&1 || true
for CODE in $TOKEN_CODES; do
  stellar tx new change-trust --line "$CODE:$ISSUER" --source "$KEY" --network "$NETWORK" >/dev/null 2>&1 || true
done

stellar contract invoke --id "$USDM_ID" --network "$NETWORK" --source "$ISSUER_KEY" \
  -- mint --to "$ADDR" --amount "$AMOUNT" >/dev/null

echo "$KEY $ADDR funded with $AMOUNT USDM stroops"
echo "buy example (1 allocation = 1 token of every vintage):"
echo "stellar contract invoke --id $SALE_ID --network $NETWORK --source $KEY -- buy --user $ADDR --allocations 1 --attestation $ATTESTATION"
