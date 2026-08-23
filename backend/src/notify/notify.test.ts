import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');

const { config } = await import('../config.js');
const { encryptDelivery } = await import('../crypto/delivery.js');
const { reconcileClaims, reconcileRepurchases } = await import('../reconcile.js');
const { notifyTransitions } = await import('./notify.js');
const { DevTransport } = await import('./transport.js');

// Integration test against the local docker Postgres.
const db = new pg.Client({ connectionString: config.databaseUrl });
const VAULT = 'CTEST' + randomBytes(8).toString('hex').toUpperCase();
const WALLET = 'G' + 'TEST'.repeat(13) + 'TES';
const EMAIL = `holder-${randomBytes(4).toString('hex')}@test.local`;
let nextId = Date.now();

async function insertEvent(kind: string, topics: unknown[], data: unknown, tx: string) {
  await db.query(
    `INSERT INTO chain_events (mercury_id, contract_id, kind, topics, data, tx, event_index)
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [nextId++, VAULT, kind, JSON.stringify(topics), JSON.stringify(data), tx],
  );
}

async function logged(): Promise<number> {
  const res = await db.query(
    'SELECT count(*)::int AS n FROM notifications_log WHERE recipient = $1',
    [EMAIL],
  );
  return res.rows[0].n;
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.query('DELETE FROM chain_events WHERE contract_id = $1', [VAULT]);
  await db.query('DELETE FROM claims WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM repurchase_requests WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM notifications_log WHERE recipient = $1', [EMAIL]);
  await db.end();
});

describe('dev transport', () => {
  it('journals the message in notifications_log', async () => {
    const transport = new DevTransport(db);
    await transport.send(EMAIL, 'sujet de test', 'corps de test');
    const row = (
      await db.query(
        'SELECT subject, body, transport FROM notifications_log WHERE recipient = $1',
        [EMAIL],
      )
    ).rows[0];
    expect(row).toMatchObject({ subject: 'sujet de test', body: 'corps de test', transport: 'dev' });
    await db.query('DELETE FROM notifications_log WHERE recipient = $1', [EMAIL]);
  });
});

describe('notification idempotence', () => {
  it('notifies each transition exactly once across repeated reconciliations', async () => {
    const transport = new DevTransport(db);
    const payload = '{"test":"notify"}';
    const hash = createHash('sha256').update(payload).digest();
    await db.query(
      `INSERT INTO claims (wallet, vault_contract, lots, delivery_ciphertext, delivery_hash, contact_ciphertext)
       VALUES ($1, $2, 1, $3, $4, $5)`,
      [WALLET, VAULT, Buffer.from('cipher'), hash, encryptDelivery(EMAIL)],
    );
    await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots, contact_ciphertext)
       VALUES ($1, $2, 1, $3)`,
      [WALLET, VAULT, encryptDelivery(EMAIL)],
    );

    // claim lands on-chain, repurchase gets redeemed
    await insertEvent('claim', [WALLET], ['1', hash.toString('hex')], 'tx_notify_claim');
    await insertEvent('redeem', [WALLET], ['1', '100'], 'tx_notify_redeem');
    await reconcileClaims(db);
    await reconcileRepurchases(db);
    expect(await notifyTransitions(db, transport)).toBe(2);
    expect(await logged()).toBe(2);

    // a second pass over the same mirror sends nothing new
    await reconcileClaims(db);
    await reconcileRepurchases(db);
    expect(await notifyTransitions(db, transport)).toBe(0);
    expect(await logged()).toBe(2);

    // the fulfilment is a distinct transition, notified once as well
    await insertEvent('fulfilled', [WALLET], null, 'tx_notify_fulfill');
    await reconcileClaims(db);
    expect(await notifyTransitions(db, transport)).toBe(1);
    await reconcileClaims(db);
    expect(await notifyTransitions(db, transport)).toBe(0);
    expect(await logged()).toBe(3);
  });

  it('marks a transition without contact email handled, sending nothing', async () => {
    const transport = new DevTransport(db);
    const before = await logged();
    const row = await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots, status)
       VALUES ($1, $2, 1, 'redeemed') RETURNING id`,
      [WALLET, VAULT],
    );
    expect(await notifyTransitions(db, transport)).toBe(0);
    const marker = (
      await db.query('SELECT redeemed_notified_at FROM repurchase_requests WHERE id = $1', [
        row.rows[0].id,
      ])
    ).rows[0].redeemed_notified_at;
    expect(marker).not.toBeNull();
    expect(await logged()).toBe(before);
  });
});
