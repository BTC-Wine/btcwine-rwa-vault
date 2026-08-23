import pg from 'pg';
import { config } from '../config.js';
import { eventsByContract } from './client.js';
import { decodeEvent } from './decode.js';
import { ledgerTime } from './txtime.js';

// JSON cannot carry bigint or Buffer, and node-postgres would serialize a JS
// array as a Postgres array literal: hand the driver a JSON string instead.
// Buffers reach the replacer already turned into their toJSON shape (JSON
// .stringify applies toJSON first), hence the shape check: hashes must land
// as hex strings, reconciliation compares them to encode(hash, 'hex').
export function jsonSafe(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (val instanceof Buffer) return val.toString('hex');
    if (
      val && typeof val === 'object' &&
      (val as { type?: string }).type === 'Buffer' &&
      Array.isArray((val as { data?: unknown }).data)
    ) {
      return Buffer.from((val as { data: number[] }).data).toString('hex');
    }
    return val;
  });
}

/** Pulls new events of one contract past the stored cursor into Postgres. */
export async function syncContract(db: pg.Client, contractId: string): Promise<number> {
  const cur = await db.query(
    'SELECT last_mercury_id FROM sync_cursor WHERE contract_id = $1',
    [contractId],
  );
  const lastId: number = cur.rows[0]?.last_mercury_id ?? 0;

  let offset = 0;
  let ingested = 0;
  let maxId = lastId;
  for (;;) {
    const page = await eventsByContract(contractId, { limit: 100, offset });
    const fresh = page.filter((e) => e.id > lastId);
    for (const raw of fresh) {
      const e = decodeEvent(raw);
      const at = await ledgerTime(e.tx);
      await db.query(
        `INSERT INTO chain_events (mercury_id, contract_id, kind, topics, data, tx, event_index, ledger_ts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (mercury_id) DO NOTHING`,
        [e.mercuryId, e.contractId, e.kind, jsonSafe(e.topics), jsonSafe(e.data), e.tx, e.eventIndex, at],
      );
      if (e.mercuryId > maxId) maxId = e.mercuryId;
      ingested++;
    }
    if (page.length < 100) break;
    offset += 100;
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

/**
 * Fills ledger_ts on rows that predate the column or whose lookup failed at
 * ingestion time. Rows the chain no longer answers for stay NULL and are
 * retried on the next run.
 */
export async function backfillLedgerTimes(db: pg.Pool | pg.Client): Promise<number> {
  const rows = await db.query('SELECT DISTINCT tx FROM chain_events WHERE ledger_ts IS NULL');
  let filled = 0;
  for (const { tx } of rows.rows) {
    const at = await ledgerTime(tx);
    if (!at) continue;
    const res = await db.query(
      'UPDATE chain_events SET ledger_ts = $2 WHERE tx = $1 AND ledger_ts IS NULL',
      [tx, at],
    );
    filled += res.rowCount ?? 0;
  }
  return filled;
}

export async function syncAll(): Promise<void> {
  const db = new pg.Client({ connectionString: config.databaseUrl });
  await db.connect();
  try {
    const contracts = [
      ...config.vaultContracts,
      ...config.tokenContracts,
      ...(config.saleContract ? [config.saleContract] : []),
    ];
    for (const id of contracts) {
      const n = await syncContract(db, id);
      console.log(`${id}: ${n} new events`);
    }
    const filled = await backfillLedgerTimes(db);
    if (filled) console.log(`backfill: ${filled} ledger timestamps`);
  } finally {
    await db.end();
  }
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  syncAll().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
