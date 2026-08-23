import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import pg from 'pg';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');

const { config } = await import('./config.js');
const { reconcileClaims, reconcileRepurchases } = await import('./reconcile.js');

// Integration test against the local docker Postgres. Each case works on its
// own fresh vault and wallet so the global reconciliation never couples them.
const db = new pg.Client({ connectionString: config.databaseUrl });
const vaults: string[] = [];
let nextId = Date.now();

function freshVault(): string {
  const v = StrKey.encodeContract(randomBytes(32));
  vaults.push(v);
  return v;
}

async function insertEvent(
  vault: string,
  kind: string,
  topics: unknown[],
  data: unknown,
  tx: string,
) {
  await db.query(
    `INSERT INTO chain_events (mercury_id, contract_id, kind, topics, data, tx, event_index)
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [nextId++, vault, kind, JSON.stringify(topics), JSON.stringify(data), tx],
  );
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  for (const v of vaults) {
    await db.query('DELETE FROM chain_events WHERE contract_id = $1', [v]);
    await db.query('DELETE FROM claims WHERE vault_contract = $1', [v]);
    await db.query('DELETE FROM repurchase_requests WHERE vault_contract = $1', [v]);
  }
  await db.end();
});

describe('reconciliation', () => {
  it('walks a claim from draft to onchain to fulfilled', async () => {
    const vault = freshVault();
    const wallet = Keypair.random().publicKey();
    const payload = '{"test":"claim"}';
    const hash = createHash('sha256').update(payload).digest();
    const row = await db.query(
      `INSERT INTO claims (wallet, vault_contract, lots, delivery_ciphertext, delivery_hash)
       VALUES ($1, $2, 1, $3, $4) RETURNING id`,
      [wallet, vault, Buffer.from('cipher'), hash],
    );
    const id = row.rows[0].id;

    // no matching event yet: nothing moves
    await reconcileClaims(db);
    let status = (await db.query('SELECT status FROM claims WHERE id = $1', [id])).rows[0].status;
    expect(status).toBe('draft');

    // the wallet lands claim_physical on-chain
    await insertEvent(vault, 'claim', [wallet], ['1', hash.toString('hex')], 'tx_claim_1');
    await reconcileClaims(db);
    const after = (await db.query('SELECT status, onchain_tx FROM claims WHERE id = $1', [id])).rows[0];
    expect(after.status).toBe('onchain');
    expect(after.onchain_tx).toBe('tx_claim_1');

    // the admin fulfills the delivery
    await insertEvent(vault, 'fulfilled', [wallet], null, 'tx_fulfill_1');
    await reconcileClaims(db);
    status = (await db.query('SELECT status FROM claims WHERE id = $1', [id])).rows[0].status;
    expect(status).toBe('fulfilled');
  });

  it('closes a repurchase request on the redeem event', async () => {
    const vault = freshVault();
    const wallet = Keypair.random().publicKey();
    const row = await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots)
       VALUES ($1, $2, 2) RETURNING id`,
      [wallet, vault],
    );
    const id = row.rows[0].id;

    await insertEvent(vault, 'redeem', [wallet], ['2', '300'], 'tx_redeem_1');
    await reconcileRepurchases(db);
    const status = (
      await db.query('SELECT status FROM repurchase_requests WHERE id = $1', [id])
    ).rows[0].status;
    expect(status).toBe('redeemed');
  });

  it('closes only one request per redeem, not every open request of the wallet', async () => {
    const vault = freshVault();
    const wallet = Keypair.random().publicKey();
    // two open requests from the same wallet on the same vault
    const a = await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots, requested_at)
       VALUES ($1, $2, 1, now() - interval '2 minutes') RETURNING id`,
      [wallet, vault],
    );
    const b = await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots, requested_at)
       VALUES ($1, $2, 1, now() - interval '1 minute') RETURNING id`,
      [wallet, vault],
    );

    // a single redeem event lands
    await insertEvent(vault, 'redeem', [wallet], ['1', '150'], 'tx_redeem_single');
    await reconcileRepurchases(db);
    let rows = await db.query(
      'SELECT id, status FROM repurchase_requests WHERE id = ANY($1)',
      [[a.rows[0].id, b.rows[0].id]],
    );
    // exactly one closed, and it is the oldest
    expect(rows.rows.filter((r) => r.status === 'redeemed').length).toBe(1);
    const oldest = (await db.query('SELECT status FROM repurchase_requests WHERE id = $1', [a.rows[0].id])).rows[0];
    expect(oldest.status).toBe('redeemed');

    // running again does not close the second one from the same spent event
    await reconcileRepurchases(db);
    rows = await db.query(
      'SELECT status FROM repurchase_requests WHERE id = ANY($1)',
      [[a.rows[0].id, b.rows[0].id]],
    );
    expect(rows.rows.filter((r) => r.status === 'redeemed').length).toBe(1);
  });
});
