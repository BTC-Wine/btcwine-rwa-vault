import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Contract, xdr, nativeToScVal, type rpc } from '@stellar/stellar-sdk';

process.env.MERCURY_JWT ??= 'unused';

const { config } = await import('../config.js');
const { decodeEvent } = await import('../mercury/decode.js');
const { fromRpcEvent, syntheticEventId, syncContractRpc } = await import('./rpc.js');
type EventsServer = import('./rpc.js').EventsServer;

const CONTRACT = 'CAVSSSO23QRLIMQYM7KMJHFZF5W4ZRHQF7DXEA4X7UVT6PPVSTDWA4XA';
const CONTRACT2 = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

// RPC event id: "<toid>-<index in tx>", toid = ledger << 32 | txOrder << 12 | op.
function rpcId(ledger: number, txOrder: number, index: number): string {
  const toid = (BigInt(ledger) << 32n) | (BigInt(txOrder) << 12n);
  return `${String(toid).padStart(19, '0')}-${String(index).padStart(10, '0')}`;
}

function makeEvent(
  ledger: number,
  txOrder: number,
  index: number,
  kind: string,
  data: unknown = null,
  contract: string = CONTRACT,
): rpc.Api.EventResponse {
  return {
    id: rpcId(ledger, txOrder, index),
    type: 'contract',
    ledger,
    ledgerClosedAt: new Date(1_787_000_000_000 + ledger * 5000).toISOString(),
    transactionIndex: txOrder,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: `tx-${ledger}-${txOrder}`,
    contractId: new Contract(contract),
    topic: [nativeToScVal(kind, { type: 'symbol' })],
    value: nativeToScVal(data),
  } as rpc.Api.EventResponse;
}

// Serves fixture events the way the RPC does: inclusive from startLedger,
// with a cursor that has walked past the latest ledger once the range is done.
function fakeServer(events: rpc.Api.EventResponse[], requests: number[] = []): EventsServer {
  return {
    getHealth: async () =>
      ({ status: 'healthy', latestLedger: 9_999_999, oldestLedger: 1, ledgerRetentionWindow: 120_960 }),
    getEvents: async (req: rpc.Api.GetEventsRequest) => {
      const start = 'startLedger' in req && req.startLedger ? req.startLedger : 1;
      requests.push(start);
      return {
        events: events.filter((e) => e.ledger >= start),
        cursor: rpcId(9_999_999, 1, 0),
        latestLedger: 9_999_999,
        oldestLedger: 1,
        latestLedgerCloseTime: '0',
        oldestLedgerCloseTime: '0',
      } as rpc.Api.GetEventsResponse;
    },
  } as EventsServer;
}

describe('syntheticEventId', () => {
  it('packs ledger, transaction order and event index', () => {
    expect(syntheticEventId(rpcId(21582, 3, 2))).toBe(21582 * 100_000 + 3 * 100 + 2);
  });

  it('increases in chain order', () => {
    const ids = [rpcId(10, 1, 0), rpcId(10, 1, 1), rpcId(10, 2, 0), rpcId(11, 1, 0)];
    const packed = ids.map(syntheticEventId);
    expect([...packed].sort((a, b) => a - b)).toEqual(packed);
  });
});

describe('fromRpcEvent', () => {
  it('decodes exactly like the Mercury path', () => {
    // real deposit event of vault 2025, XDR shared with decode.test.ts
    const topic1 = 'AAAADwAAAAdkZXBvc2l0AA==';
    const topic2 = 'AAAAEgAAAAAAAAAAKUtgqUlZDLNgc8OB1fePxx8XPnne7z6sMQ0u5ZBZnrs=';
    const data =
      'AAAAEAAAAAEAAAADAAAACgAAAAAAAAAAAAAAAAAAAAEAAAAKAAAAAAAAAAAAAAAAeskbAAAAAA0AAAAgP7zLt9Y5+AGJaRtSVCWft5V/veBDn699qUQ8uEakAM0=';
    const viaMercury = decodeEvent({
      id: 21582 * 100_000 + 1 * 100 + 2,
      contract_id: CONTRACT,
      topic1,
      topic2,
      topic3: '',
      topic4: '',
      data,
      tx: 'a4dae70a50c5b5645e9fdf20c56f6d67913d4e55f5333ab087af436f695024b9',
      event_index: 2,
    });
    const viaRpc = fromRpcEvent({
      ...makeEvent(21582, 1, 2, 'unused'),
      txHash: 'a4dae70a50c5b5645e9fdf20c56f6d67913d4e55f5333ab087af436f695024b9',
      topic: [xdr.ScVal.fromXDR(topic1, 'base64'), xdr.ScVal.fromXDR(topic2, 'base64')],
      value: xdr.ScVal.fromXDR(data, 'base64'),
    });
    expect(viaRpc).toEqual(viaMercury);
  });
});

// Integration test against the local docker Postgres, chain served by fixtures.
describe('syncContractRpc', () => {
  const db = new pg.Client({ connectionString: config.databaseUrl });

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.query('DELETE FROM chain_events WHERE contract_id = ANY($1)', [[CONTRACT, CONTRACT2]]);
    await db.query('DELETE FROM sync_cursor WHERE contract_id = ANY($1)', [[CONTRACT, CONTRACT2]]);
    await db.end();
  });

  it('ingests, is idempotent on replay, and resumes without holes', async () => {
    const batch = [
      makeEvent(100, 1, 0, 'deposit', '1'),
      makeEvent(100, 2, 0, 'transfer', '2'),
      makeEvent(101, 1, 0, 'redeem', '3'),
    ];
    expect(await syncContractRpc(db, CONTRACT, fakeServer(batch))).toBe(3);

    const rows = await db.query(
      'SELECT mercury_id, kind, ledger_ts FROM chain_events WHERE contract_id = $1 ORDER BY mercury_id',
      [CONTRACT],
    );
    expect(rows.rows.map((r) => r.kind)).toEqual(['deposit', 'transfer', 'redeem']);
    expect(rows.rows[0].ledger_ts).not.toBeNull();

    // same chain replayed: nothing new, nothing duplicated
    expect(await syncContractRpc(db, CONTRACT, fakeServer(batch))).toBe(0);
    const count = await db.query(
      'SELECT count(*)::int AS n FROM chain_events WHERE contract_id = $1',
      [CONTRACT],
    );
    expect(count.rows[0].n).toBe(3);

    // a later event in the cursor ledger and one past it both come through:
    // resumption re-requests the ledger of the last stored event
    const requests: number[] = [];
    const hash = Buffer.from('aec8fa9ec45c1118cb699a1da2f4396a0be5d6899e213fe3d0809330bb726409', 'hex');
    const grown = [...batch, makeEvent(101, 2, 0, 'claim', hash), makeEvent(102, 1, 0, 'settled', '5')];
    expect(await syncContractRpc(db, CONTRACT, fakeServer(grown, requests))).toBe(2);
    expect(requests[0]).toBe(101);

    // buffers must land as hex strings: reconciliation compares delivery
    // hashes to encode(hash, 'hex')
    const claim = await db.query(
      `SELECT data FROM chain_events WHERE contract_id = $1 AND kind = 'claim'`,
      [CONTRACT],
    );
    expect(claim.rows[0].data).toBe(hash.toString('hex'));

    const cursor = await db.query(
      'SELECT last_mercury_id FROM sync_cursor WHERE contract_id = $1',
      [CONTRACT],
    );
    expect(Number(cursor.rows[0].last_mercury_id)).toBe(102 * 100_000 + 1 * 100);
  });

  it('follows the scan cursor across empty windows', async () => {
    // the RPC scans a bounded ledger range per request: an empty page with a
    // cursor short of the latest ledger means keep going, not done
    const event = makeEvent(200, 1, 0, 'deposit', 'windowed', CONTRACT2);
    let calls = 0;
    const server = {
      getHealth: async () =>
        ({ status: 'healthy', latestLedger: 200, oldestLedger: 1, ledgerRetentionWindow: 120_960 }),
      getEvents: async (req: rpc.Api.GetEventsRequest) => {
        calls++;
        const partial = 'startLedger' in req && req.startLedger !== undefined;
        return {
          events: partial ? [] : [event],
          cursor: partial ? rpcId(150, 1, 0) : rpcId(200, 1, 0),
          latestLedger: 200,
          oldestLedger: 1,
          latestLedgerCloseTime: '0',
          oldestLedgerCloseTime: '0',
        } as rpc.Api.GetEventsResponse;
      },
    } as EventsServer;
    expect(await syncContractRpc(db, CONTRACT2, server)).toBe(1);
    expect(calls).toBe(2);
  });
});
