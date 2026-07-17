#!/usr/bin/env bash
# Places a sell offer USDM vs XLM on the testnet DEX so that path payments
# (pay with XLM) can be exercised end to end. Mainnet uses the real USDC
# order books, this is test plumbing only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/.deploy-testnet.env"

AMOUNT="${AMOUNT:-500000}"        # USDM offered
PRICE="${PRICE:-7:20}"            # XLM per USDM en fraction (0,35 : 1 XLM ~ 2,85 USDM)

# the issuer can sell without holding a balance? no: mint to issuer first is
# impossible (issuer mints by paying). Use a dedicated market maker account.
ensure_key() {
  stellar keys address "$1" >/dev/null 2>&1 || stellar keys generate "$1" --network "$NETWORK" --fund
}
ensure_key terwa-mm
MM=$(stellar keys address terwa-mm)

stellar tx new change-trust --line "USDM:$ISSUER" --source terwa-mm --network "$NETWORK" >/dev/null 2>&1 || true
stellar contract invoke --id "$USDM_ID" --network "$NETWORK" --source "$ISSUER_KEY" \
  -- mint --to "$MM" --amount "$(( AMOUNT * 10000000 ))" >/dev/null

stellar tx new manage-sell-offer \
  --source terwa-mm \
  --network "$NETWORK" \
  --selling "USDM:$ISSUER" \
  --buying native \
  --amount "$(( AMOUNT * 10000000 ))" \
  --price "$PRICE" >/dev/null

echo "market maker $MM sells $AMOUNT USDM at $PRICE XLM/USDM"
