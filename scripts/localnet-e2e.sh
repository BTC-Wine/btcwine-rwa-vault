#!/usr/bin/env bash
# Full dress rehearsal of the Bloc 2 platform on a local Stellar network
# (stellar/quickstart with --local), never the public testnet. Deploys a
# fresh two-vintage allocation with its sale router, runs the backend API
# and worker against it (events ingested through the RPC source), then walks
# the exact journey the foundation will see at delivery: buy through the
# router, secondary transfer, KYC to on-chain allowlist, maturity, settle,
# repurchase served by the API, physical claim to fulfilment, and the read
# endpoints. Rerunnable: fresh issuer and asset codes per run, the database
# is never wiped, every assertion filters on this run's contracts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT_WASM="$ROOT/contracts/target/wasm32v1-none/release/terwa_vault.wasm"
SALE_WASM="$ROOT/contracts/target/wasm32v1-none/release/allocation_sale.wasm"
NET="local"
RPC="http://localhost:8000/rpc"
HORIZON="http://localhost:8000"
PASSPHRASE="Standalone Network ; February 2017"
API_PORT=3220
API="http://localhost:$API_PORT"
STAMP=$(date +%s)
RUN=$(date +%H%M%S)
LOGDIR=$(mktemp -d -t terwa-e2e)

API_PID=""
WORKER_PID=""
cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1"
  echo "-- api log tail ($LOGDIR/api.log)"
  tail -20 "$LOGDIR/api.log" 2>/dev/null || true
  echo "-- worker log tail ($LOGDIR/worker.log)"
  tail -20 "$LOGDIR/worker.log" 2>/dev/null || true
  exit 1
}

db() { # one psql query against the local docker Postgres, bare value output
  docker compose -f "$ROOT/backend/docker-compose.yml" exec -T db \
    psql -U terwa -d terwa -tA -c "$1"
}

jsonval() { # jsonval <json> <dot.path>
  node -e '
let v = JSON.parse(process.argv[1]);
for (const k of process.argv[2].split(".")) v = v[k];
console.log(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
' "$1" "$2"
}

invoke() { # invoke <source> <contract> <fn> [args...]
  local src="$1" id="$2"; shift 2
  stellar contract invoke --id "$id" --network "$NET" --source "$src" -- "$@"
}

echo "== prerequisites =="
command -v stellar >/dev/null || { echo "stellar CLI missing"; exit 1; }
command -v node >/dev/null || { echo "node missing"; exit 1; }
[ -f "$VAULT_WASM" ] || { echo "wasm not built, run: cd contracts && stellar contract build"; exit 1; }
[ -f "$SALE_WASM" ] || { echo "wasm not built, run: cd contracts && stellar contract build"; exit 1; }
curl -sf "$RPC" -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null \
  || { echo "local network not reachable on $RPC (docker run stellar/quickstart --local)"; exit 1; }
db 'SELECT 1' >/dev/null \
  || { echo "local Postgres not reachable (cd backend && docker compose up -d)"; exit 1; }
stellar network add "$NET" --rpc-url "$RPC" --network-passphrase "$PASSPHRASE" 2>/dev/null || true

echo "== identities =="
ISSUER_KEY="lv-issuer-$STAMP"
stellar keys generate "$ISSUER_KEY" --network "$NET" --fund
for k in lv-admin lv-oracle lv-user lv-user2 lv-kyc; do
  stellar keys address "$k" >/dev/null 2>&1 || stellar keys generate "$k" --network "$NET" --fund
  stellar keys fund "$k" --network "$NET" >/dev/null 2>&1 || true
done
ADMIN=$(stellar keys address lv-admin)
USER=$(stellar keys address lv-user)
USER2=$(stellar keys address lv-user2)
ISSUER=$(stellar keys address "$ISSUER_KEY")
KYC=$(stellar keys address lv-kyc)
ORACLE=$(stellar keys address lv-oracle)

echo "== deployment: two vintages, one sale router =="
ATT=$(shasum -a 256 "$ROOT/legal/attestation-v1.md" | cut -d' ' -f1)
NOW=$(date +%s)
MATURITY=$((NOW + 90))
# fresh issuer every run: the SAC never pre-exists, so no id fallback here,
# only retries while the friendbot funding of the issuer settles
USDM=""
for i in $(seq 1 10); do
  USDM=$(stellar contract asset deploy --asset "USDM:$ISSUER" --network "$NET" --source "$ISSUER_KEY" 2>/dev/null) && break
  [ "$i" = 10 ] && { echo "USDM deploy failed, issuer never funded?"; exit 1; }
  sleep 2
done
VAULTS=""
TOKENS=""
CODES="EA$RUN EB$RUN"
for CODE in $CODES; do
  TOKEN=$(stellar contract asset deploy --asset "$CODE:$ISSUER" --network "$NET" --source "$ISSUER_KEY")
  VAULT=$(stellar contract deploy --wasm "$VAULT_WASM" --network "$NET" --source lv-admin -- \
    --admin "$ADMIN" --vault_token "$TOKEN" --stablecoin "$USDM" --oracle "$ORACLE" \
    --maturity_ts "$MATURITY" --unit_price 100 --max_supply 100 --bundle_lots 1 \
    --attestation "$ATT" 2>/dev/null | tail -1)
  invoke "$ISSUER_KEY" "$TOKEN" set_admin --new_admin "$VAULT" >/dev/null
  invoke lv-admin "$VAULT" set_exit_check --required true >/dev/null
  invoke lv-admin "$VAULT" set_allowlist_manager --manager "$KYC" >/dev/null
  echo "$CODE  token $TOKEN  vault $VAULT"
  VAULTS="$VAULTS $VAULT"
  TOKENS="$TOKENS $TOKEN"
done
V1=$(echo "$VAULTS" | awk '{print $1}'); V2=$(echo "$VAULTS" | awk '{print $2}')
T1=$(echo "$TOKENS" | awk '{print $1}'); T2=$(echo "$TOKENS" | awk '{print $2}')
CODE1=$(echo "$CODES" | awk '{print $1}')
SALE=$(stellar contract deploy --wasm "$SALE_WASM" --network "$NET" --source lv-admin -- \
  --admin "$ADMIN" --vaults "[\"$V1\",\"$V2\"]" 2>/dev/null | tail -1)
for VAULT in $V1 $V2; do
  invoke lv-admin "$VAULT" set_router --router "$SALE" >/dev/null
done
echo "sale $SALE"

echo "== backend services (API :$API_PORT, worker on the rpc source) =="
docker compose -f "$ROOT/backend/docker-compose.yml" exec -T db \
  psql -U terwa -d terwa -q < "$ROOT/backend/src/db/schema.sql"
# kyc statuses are keyed by wallet, not by deployment: forget what previous
# rehearsals decided for this run's wallets so the bridge runs end to end
db "DELETE FROM kyc_status WHERE wallet IN ('$USER', '$USER2')" >/dev/null

ADMIN_TOKEN="e2e-admin-$STAMP"
SUMSUB_SECRET="e2e-sumsub-$STAMP"
CONTACT_HOLDER="holder-$STAMP@test.local"
CONTACT_BUYER="buyer-$STAMP@test.local"
SEP10_SECRET=$(cd "$ROOT/backend" && node -e \
  "console.log(require('@stellar/stellar-sdk').Keypair.random().secret())")
BACKEND_ENV=(
  EVENTS_SOURCE=rpc
  MERCURY_JWT=unused
  RPC_URL="$RPC"
  HORIZON_URL="$HORIZON"
  NETWORK_PASSPHRASE="$PASSPHRASE"
  DATABASE_URL="postgres://terwa:terwa@localhost:5433/terwa"
  DELIVERY_KEY="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
  SEP10_SIGNING_SECRET="$SEP10_SECRET"
  ORACLE_SECRET="$(stellar keys secret lv-oracle)"
  ALLOWLIST_SECRET="$(stellar keys secret lv-kyc)"
  SUMSUB_WEBHOOK_SECRET="$SUMSUB_SECRET"
  ADMIN_TOKEN="$ADMIN_TOKEN"
  POSTMARK_TOKEN=
  SENTRY_DSN=
  VAULT_CONTRACTS="$V1,$V2"
  TOKEN_CONTRACTS="$T1,$T2"
  SALE_CONTRACT="$SALE"
)
cd "$ROOT/backend"
env "${BACKEND_ENV[@]}" PORT="$API_PORT" npx tsx src/api/server.ts >"$LOGDIR/api.log" 2>&1 &
API_PID=$!
env "${BACKEND_ENV[@]}" SYNC_INTERVAL_MS=2000 npx tsx src/worker.ts >"$LOGDIR/worker.log" 2>&1 &
WORKER_PID=$!
cd "$ROOT"
for i in $(seq 1 30); do
  curl -s "$API/health" >/dev/null && break
  [ "$i" = 30 ] && fail "API did not come up on :$API_PORT"
  sleep 1
done
echo "ok: api ($API_PID) and worker ($WORKER_PID) running, logs in $LOGDIR"

sep10_token() { # sep10_token <address> <key-name>, prints a session JWT
  local challenge signed body
  challenge=$(jsonval "$(curl -sf "$API/auth/challenge?account=$1")" transaction)
  signed=$(cd "$ROOT/backend" && node -e '
const { TransactionBuilder, Keypair } = require("@stellar/stellar-sdk");
const tx = TransactionBuilder.fromXDR(process.argv[1], process.argv[2]);
tx.sign(Keypair.fromSecret(process.argv[3]));
console.log(tx.toXDR());
' "$challenge" "$PASSPHRASE" "$(stellar keys secret "$2")")
  body=$(node -e 'console.log(JSON.stringify({ transaction: process.argv[1] }))' "$signed")
  jsonval "$(curl -sf -X POST "$API/auth/token" -H 'Content-Type: application/json' -d "$body")" token
}

kyc_approve() { # kyc_approve <address>, signed synthetic Sumsub webhook
  local body digest
  body="{\"type\":\"applicantReviewed\",\"applicantId\":\"e2e-$STAMP\",\"externalUserId\":\"$1\",\"reviewResult\":{\"reviewAnswer\":\"GREEN\"}}"
  digest=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SUMSUB_SECRET" | awk '{print $NF}')
  curl -sf -X POST "$API/kyc/webhook" -H 'Content-Type: application/json' \
    -H "x-payload-digest: $digest" -H 'x-payload-digest-alg: HMAC_SHA256_HEX' \
    -d "$body" >/dev/null || fail "kyc webhook rejected for $1"
}

echo "== a. buy one allocation through the router =="
for LINE in "USDM:$ISSUER" "EA$RUN:$ISSUER" "EB$RUN:$ISSUER"; do
  stellar tx new change-trust --line "$LINE" --source lv-user --network "$NET" >/dev/null 2>&1 || true
done
invoke "$ISSUER_KEY" "$USDM" mint --to "$USER" --amount 100000 >/dev/null
PAID=$(invoke lv-user "$SALE" buy --user "$USER" --allocations 1 --attestation "$ATT")
[ "$PAID" = '"200"' ] || fail "buy expected total 200 (100 per vintage), got $PAID"
echo "ok: 1 allocation bought, 1 token of each vintage, 200 USDM paid"

echo "== b. secondary transfer: 1 token of $CODE1 to a second holder =="
# the vintage line to receive the token now, the USDM line for the later payout
stellar tx new change-trust --line "$CODE1:$ISSUER" --source lv-user2 --network "$NET" >/dev/null 2>&1 || true
stellar tx new change-trust --line "USDM:$ISSUER" --source lv-user2 --network "$NET" >/dev/null 2>&1 || true
stellar tx new payment --source lv-user --destination "$USER2" \
  --asset "$CODE1:$ISSUER" --amount 10000000 --network "$NET" >/dev/null
echo "ok: classic payment sent, no allowlist needed to hold"

echo "== c. worker ingestion of the run's events =="
for i in $(seq 1 45); do
  DEPOSITS=$(db "SELECT count(*) FROM chain_events WHERE contract_id IN ('$V1','$V2') AND kind='deposit'")
  BUYS=$(db "SELECT count(*) FROM chain_events WHERE contract_id = '$SALE' AND kind='buy'")
  MINTS=$(db "SELECT count(*) FROM chain_events WHERE contract_id IN ('$T1','$T2') AND kind='mint'")
  MOVES=$(db "SELECT count(*) FROM chain_events WHERE contract_id = '$T1' AND kind='transfer'
              AND topics->>0 = '$USER' AND topics->>1 = '$USER2'")
  [ "$DEPOSITS" = 2 ] && [ "$BUYS" = 1 ] && [ "$MINTS" = 2 ] && [ "$MOVES" = 1 ] && break
  [ "$i" = 45 ] && fail "mirror incomplete (deposits $DEPOSITS/2, buys $BUYS/1, mints $MINTS/2, transfers $MOVES/1)"
  sleep 2
done
echo "ok: deposits 2, buy 1, mints 2, secondary transfer 1 in chain_events"

echo "== d. kyc: webhook to on-chain allowlist for both holders =="
kyc_approve "$USER"
kyc_approve "$USER2"
for i in $(seq 1 45); do
  A1=$(invoke lv-admin "$V1" is_allowed --addr "$USER")
  A2=$(invoke lv-admin "$V2" is_allowed --addr "$USER")
  B1=$(invoke lv-admin "$V1" is_allowed --addr "$USER2")
  B2=$(invoke lv-admin "$V2" is_allowed --addr "$USER2")
  [ "$A1$A2$B1$B2" = "truetruetruetrue" ] && break
  [ "$i" = 45 ] && fail "allowlist incomplete on-chain ($A1 $A2 $B1 $B2)"
  sleep 2
done
echo "ok: both holders allowed on both vaults by the manager key"

echo "== e. maturity, then settle both vaults =="
invoke lv-admin "$V1" close_presale >/dev/null
invoke lv-admin "$V2" close_presale >/dev/null
for i in $(seq 1 40); do
  STATE=$(invoke lv-admin "$V1" get_state)
  echo "$STATE" | grep -q Matured && break
  [ "$i" = 40 ] && fail "vault never matured (state $STATE)"
  sleep 3
done
stellar tx new change-trust --line "USDM:$ISSUER" --source lv-admin --network "$NET" >/dev/null 2>&1 || true
invoke "$ISSUER_KEY" "$USDM" mint --to "$ADMIN" --amount 10000 >/dev/null
invoke lv-admin "$V1" settle --from "$ADMIN" --amount 100 >/dev/null
invoke lv-admin "$V2" settle --from "$ADMIN" --amount 100 >/dev/null
echo "ok: matured and settled, 100 USDM of repurchase funds per vintage"

echo "== f. repurchase: API request, on-chain redeem, reconciliation =="
JWT2=$(sep10_token "$USER2" lv-user2)
[ -n "$JWT2" ] || fail "sep10 token for the second holder is empty"
REP=$(curl -sf -X POST "$API/repurchases" -H "Authorization: Bearer $JWT2" \
  -H 'Content-Type: application/json' \
  -d "{\"vaultContract\":\"$V1\",\"lots\":1,\"contactEmail\":\"$CONTACT_HOLDER\"}")
REP_ID=$(jsonval "$REP" id)
[ "$(jsonval "$REP" status)" = requested ] || fail "repurchase not requested: $REP"
PAYOUT=$(invoke lv-user2 "$V1" redeem --user "$USER2" --lots 1)
[ "$PAYOUT" = '"100"' ] || fail "redeem payout expected 100, got $PAYOUT"
for i in $(seq 1 30); do
  RSTATUS=$(db "SELECT status FROM repurchase_requests WHERE id = $REP_ID")
  [ "$RSTATUS" = redeemed ] && break
  [ "$i" = 30 ] && fail "repurchase $REP_ID stuck in '$RSTATUS'"
  sleep 2
done
for i in $(seq 1 15); do
  NOTES=$(db "SELECT count(*) FROM notifications_log WHERE recipient = '$CONTACT_HOLDER'")
  [ "$NOTES" = 1 ] && break
  [ "$i" = 15 ] && fail "expected 1 settlement notification for $CONTACT_HOLDER, got $NOTES"
  sleep 2
done
echo "ok: request $REP_ID redeemed on-chain, closed by reconciliation, holder notified"

echo "== g. physical claim: API, on-chain, logistics, fulfilment =="
JWT1=$(sep10_token "$USER" lv-user)
[ -n "$JWT1" ] || fail "sep10 token for the buyer is empty"
CLAIM_BODY=$(node -e 'console.log(JSON.stringify({
  vaultContract: process.argv[1],
  lots: 1,
  payload: JSON.stringify({ name: "E2E Holder", address: "1 rue du Test, 33000 Bordeaux" }),
  contactEmail: process.argv[2],
}))' "$V2" "$CONTACT_BUYER")
CLAIM=$(curl -sf -X POST "$API/claims" -H "Authorization: Bearer $JWT1" \
  -H 'Content-Type: application/json' -d "$CLAIM_BODY")
CLAIM_ID=$(jsonval "$CLAIM" id)
HASH=$(jsonval "$CLAIM" deliveryHashHex)
[ -n "$HASH" ] || fail "claim draft returned no delivery hash: $CLAIM"
invoke lv-user "$V2" claim_physical --user "$USER" --lots 1 --delivery_hash "$HASH" >/dev/null
for i in $(seq 1 30); do
  CSTATUS=$(db "SELECT status FROM claims WHERE id = $CLAIM_ID")
  [ "$CSTATUS" = onchain ] && break
  [ "$i" = 30 ] && fail "claim $CLAIM_ID stuck in '$CSTATUS' before logistics"
  sleep 2
done
for STEP in preparing shipped; do
  MOVED=$(curl -sf -X PATCH "$API/admin/claims/$CLAIM_ID" -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' -d "{\"status\":\"$STEP\"}")
  [ "$(jsonval "$MOVED" status)" = "$STEP" ] || fail "admin transition to $STEP refused: $MOVED"
done
invoke lv-admin "$V2" fulfill_claim --user "$USER" >/dev/null
for i in $(seq 1 30); do
  CSTATUS=$(db "SELECT status FROM claims WHERE id = $CLAIM_ID")
  [ "$CSTATUS" = fulfilled ] && break
  [ "$i" = 30 ] && fail "claim $CLAIM_ID stuck in '$CSTATUS' after fulfil"
  sleep 2
done
for i in $(seq 1 15); do
  NOTES=$(db "SELECT count(*) FROM notifications_log WHERE recipient = '$CONTACT_BUYER'")
  [ "$NOTES" = 2 ] && break
  [ "$i" = 15 ] && fail "expected received and fulfilled notifications for $CONTACT_BUYER, got $NOTES"
  sleep 2
done
echo "ok: claim $CLAIM_ID draft, onchain, preparing, shipped, fulfilled, buyer notified twice"

echo "== h. read endpoints =="
node -e '
const [hist, vault, sale, kind] = process.argv.slice(1);
const { events } = JSON.parse(hist);
const hit = events.find((e) => e.contract_id === vault && e.kind === kind);
if (!hit) throw new Error(`no ${kind} event on ${vault} in history`);
if (!hit.ledger_ts) throw new Error(`${kind} event is missing its ledger timestamp`);
if (!events.some((e) => e.contract_id === sale && e.kind === "buy"))
  throw new Error("buy event missing from history");
' "$(curl -sf "$API/history/$USER")" "$V2" "$SALE" claim \
  || fail "buyer history incomplete"
node -e '
const [hist, vault, token] = process.argv.slice(1);
const { events } = JSON.parse(hist);
if (!events.some((e) => e.contract_id === vault && e.kind === "redeem"))
  throw new Error("redeem event missing from history");
if (!events.some((e) => e.contract_id === token && e.kind === "transfer"))
  throw new Error("secondary transfer missing from history");
' "$(curl -sf "$API/history/$USER2")" "$V1" "$T1" \
  || fail "second holder history incomplete"
OVERVIEW=$(curl -sf "$API/admin/overview" -H "Authorization: Bearer $ADMIN_TOKEN")
node -e '
const o = JSON.parse(process.argv[1]);
if (!(o.claims.fulfilled >= 1)) throw new Error("no fulfilled claim in overview");
if (!(o.repurchases.redeemed >= 1)) throw new Error("no redeemed repurchase in overview");
if (o.ingestLagSeconds === null || o.ingestLagSeconds > 300)
  throw new Error(`ingestion lag ${o.ingestLagSeconds}`);
' "$OVERVIEW" || fail "admin overview incoherent: $OVERVIEW"
echo "ok: dated histories for both wallets, coherent admin overview"

echo
echo "ALL CHECKS PASSED"
