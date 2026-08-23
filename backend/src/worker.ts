import * as Sentry from '@sentry/node';
import pg from 'pg';
import { config } from './config.js';
import { backfillLedgerTimes, syncContract } from './mercury/sync.js';
import { syncContractRpc } from './events/rpc.js';
import { reconcileClaims, reconcileRepurchases } from './reconcile.js';
import { processAllowlist } from './kyc/allowlist.js';
import { notifyTransitions } from './notify/notify.js';
import { makeTransport, type Transport } from './notify/transport.js';

// One loop does everything sequentially: pull fresh events from the chain
// (Mercury by default, the RPC on networks Mercury does not index), then let
// the mirror drive the business-status transitions. Sequential on purpose:
// reconciliation must always see a fully synced mirror.

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 30_000);
const FAILURE_ALERT_THRESHOLD = Number(process.env.WORKER_FAILURE_THRESHOLD || 5);

// Error tracking is opt-in: without a DSN the SDK is never initialized and
// every capture call below is a no-op.
if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN });

let running = true;

async function tick(db: pg.Client, transport: Transport): Promise<void> {
  const contracts = [
    ...config.vaultContracts,
    ...config.tokenContracts,
    ...(config.saleContract ? [config.saleContract] : []),
  ];
  const syncOne = config.eventsSource === 'rpc' ? syncContractRpc : syncContract;
  let events = 0;
  for (const id of contracts) events += await syncOne(db, id);
  await backfillLedgerTimes(db);
  const transitions =
    (await reconcileClaims(db)) +
    (await reconcileRepurchases(db)) +
    (await processAllowlist(db));
  const notified = await notifyTransitions(db, transport);
  if (events || transitions || notified) {
    console.log(
      `sync: ${events} new events, ${transitions} status transitions, ${notified} notifications`,
    );
  }
}

async function main(): Promise<void> {
  const db = new pg.Client({ connectionString: config.databaseUrl });
  await db.connect();
  const transport = makeTransport(db);
  const stop = () => {
    running = false;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log(`worker started, interval ${INTERVAL_MS}ms, transport ${transport.name}`);
  let failures = 0;
  while (running) {
    try {
      await tick(db, transport);
      failures = 0;
    } catch (err) {
      failures++;
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
      console.error('tick failed, will retry:', err);
      if (failures >= FAILURE_ALERT_THRESHOLD) {
        console.error(`worker unhealthy: ${failures} consecutive tick failures`);
      }
    }
    for (let waited = 0; running && waited < INTERVAL_MS; waited += 500) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await db.end();
  console.log('worker stopped');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
