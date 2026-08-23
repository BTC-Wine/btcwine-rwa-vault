import pg from 'pg';
import { rpc } from '@stellar/stellar-sdk';
import { config } from '../config.js';
import { decodeEvent, type DecodedEvent } from '../mercury/decode.js';
import { jsonSafe } from '../mercury/sync.js';
import type { MercuryEvent } from '../mercury/client.js';

// Alternative event source for networks Mercury does not index, the local
// quickstart network mainly: the Soroban RPC getEvents method, selected with
// EVENTS_SOURCE=rpc (Mercury stays the default). Rows land in chain_events
// in the exact shape of the Mercury path, so reconciliation, history and
// stats never know which source fed them.

const PAGE = 100;

// Synthetic id in place of Mercury's sequential row id. Derived from the RPC
// event id "<toid>-<index in tx>" where toid packs (ledger << 32) |
// (tx order << 12) | op index: ledger * 100000 + tx order * 100 + index.
// Stable (a pure function of the event's chain position), strictly
// increasing in chain order, and far above any real Mercury id so the two
// sources can never collide on the primary key. Assumes fewer than 1000
// transactions per ledger and 100 events per transaction, comfortable on the
// local networks this source targets.
const LEDGER_FACTOR = 100_000;

export function syntheticEventId(rpcEventId: string): number {
  const [toidStr, indexStr] = rpcEventId.split('-');
  const toid = BigInt(toidStr);
  const ledger = toid >> 32n;
  const txOrder = (toid >> 12n) & 0xfffffn;
  return Number(ledger * BigInt(LEDGER_FACTOR) + txOrder * 100n + BigInt(indexStr));
}

/** Reshapes an RPC event into the Mercury row format and reuses the single
 *  decode path. RPC serves topics and value as XDR objects already, so they
 *  go back through base64 to keep one decoder. */
export function fromRpcEvent(e: rpc.Api.EventResponse): DecodedEvent {
  const topics = e.topic.map((t) => t.toXDR('base64'));
  const shaped: MercuryEvent = {
    id: syntheticEventId(e.id),
    contract_id: e.contractId?.contractId() ?? '',
    topic1: topics[0] ?? '',
    topic2: topics[1] ?? '',
    topic3: topics[2] ?? '',
    topic4: topics[3] ?? '',
    data: e.value.toXDR('base64'),
    tx: e.txHash,
    event_index: Number(e.id.split('-')[1]),
  };
  return decodeEvent(shaped);
}

/** The two calls the sync needs, injectable for tests. */
export type EventsServer = Pick<rpc.Server, 'getEvents' | 'getHealth'>;

function defaultServer(): EventsServer {
  return new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
}

/**
 * Pulls new events of one contract past the stored cursor into Postgres,
 * through the RPC. The sync_cursor row is shared with the Mercury path: the
 * synthetic id embeds the ledger, so resumption re-requests the ledger of
 * the last stored event (getEvents is inclusive) and deduplicates its tail
 * by id. ledger_ts comes straight from the ledger close time the RPC serves,
 * no per transaction lookup needed.
 */
export async function syncContractRpc(
  db: pg.Client,
  contractId: string,
  server: EventsServer = defaultServer(),
): Promise<number> {
  const cur = await db.query(
    'SELECT last_mercury_id FROM sync_cursor WHERE contract_id = $1',
    [contractId],
  );
  const lastId = Number(cur.rows[0]?.last_mercury_id ?? 0);

  let startLedger = Math.max(1, Math.floor(lastId / LEDGER_FACTOR));
  const health = await server.getHealth();
  if (startLedger < health.oldestLedger) {
    // resumption point fell out of the RPC retention window: events between
    // the cursor and the oldest retained ledger are lost for this source
    if (lastId > 0) {
      console.warn(
        `${contractId}: cursor ledger ${startLedger} older than retention (oldest ${health.oldestLedger}), possible gap`,
      );
    }
    startLedger = health.oldestLedger;
  }

  const filters = [{ type: 'contract' as const, contractIds: [contractId] }];
  let request: rpc.Api.GetEventsRequest = { filters, startLedger, limit: PAGE };
  let ingested = 0;
  let maxId = lastId;
  for (;;) {
    const page = await server.getEvents(request);
    for (const raw of page.events) {
      const e = fromRpcEvent(raw);
      if (e.mercuryId <= lastId) continue;
      await db.query(
        `INSERT INTO chain_events (mercury_id, contract_id, kind, topics, data, tx, event_index, ledger_ts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (mercury_id) DO NOTHING`,
        [e.mercuryId, e.contractId, e.kind, jsonSafe(e.topics), jsonSafe(e.data), e.tx,
         e.eventIndex, new Date(raw.ledgerClosedAt)],
      );
      if (e.mercuryId > maxId) maxId = e.mercuryId;
      ingested++;
    }
    // the RPC scans a bounded ledger window per request and hands back a
    // cursor even on an empty page: done only once the cursor has walked
    // past the latest ledger the response knew about
    const cursorLedger = Number(BigInt(page.cursor.split('-')[0]) >> 32n);
    if (page.events.length < PAGE && cursorLedger >= page.latestLedger) break;
    request = { filters, cursor: page.cursor, limit: PAGE };
  }

  await db.query(
    `INSERT INTO sync_cursor (contract_id, last_mercury_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (contract_id) DO UPDATE
       SET last_mercury_id = EXCLUDED.last_mercury_id, updated_at = now()`,
    [contractId, maxId],
  );
  return ingested;
}
