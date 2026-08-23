import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import pg from 'pg';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
// a configured contract, read once when config loads, so /health exercises the
// ingestion-lag path instead of the "nothing to sync is always fresh" shortcut
process.env.VAULT_CONTRACTS ??= 'CTESTHEALTHCONTRACT';

const { config } = await import('../config.js');
const { decryptDelivery } = await import('../crypto/delivery.js');
const { buildServer } = await import('./server.js');

// Integration test against the local docker Postgres.
const db = new pg.Client({ connectionString: config.databaseUrl });
const VAULT = StrKey.encodeContract(randomBytes(32));
const WALLET = Keypair.random().publicKey();
const CURSOR_CONTRACT = 'CTESTCURSOR' + randomBytes(8).toString('hex').toUpperCase();
const EMAIL = `contact-${randomBytes(4).toString('hex')}@test.local`;

let app: Awaited<ReturnType<typeof buildServer>>;
let token: string;

beforeAll(async () => {
  await db.connect();
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ sub: WALLET });
});

afterAll(async () => {
  await db.query('DELETE FROM claims WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM repurchase_requests WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM sync_cursor WHERE contract_id = $1', [CURSOR_CONTRACT]);
  await db.end();
  await app.close();
});

describe('contact email', () => {
  it('stores the claim contact encrypted, never in clear', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/claims',
      headers: { authorization: `Bearer ${token}` },
      payload: { vaultContract: VAULT, lots: 1, payload: '{"n":"x"}', contactEmail: EMAIL },
    });
    expect(res.statusCode).toBe(200);
    const row = (
      await db.query('SELECT contact_ciphertext FROM claims WHERE vault_contract = $1', [VAULT])
    ).rows[0];
    expect(row.contact_ciphertext).not.toBeNull();
    expect(row.contact_ciphertext.includes(Buffer.from(EMAIL))).toBe(false);
    expect(decryptDelivery(row.contact_ciphertext)).toBe(EMAIL);
  });

  it('stores the repurchase contact encrypted and stays optional', async () => {
    for (const contactEmail of [EMAIL, undefined]) {
      const res = await app.inject({
        method: 'POST',
        url: '/repurchases',
        headers: { authorization: `Bearer ${token}` },
        payload: { vaultContract: VAULT, lots: 1, contactEmail },
      });
      expect(res.statusCode).toBe(200);
    }
    const rows = (
      await db.query(
        'SELECT contact_ciphertext FROM repurchase_requests WHERE vault_contract = $1 ORDER BY id',
        [VAULT],
      )
    ).rows;
    expect(decryptDelivery(rows[0].contact_ciphertext)).toBe(EMAIL);
    expect(rows[1].contact_ciphertext).toBeNull();
  });

  it('rejects a malformed contact email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/repurchases',
      headers: { authorization: `Bearer ${token}` },
      payload: { vaultContract: VAULT, lots: 1, contactEmail: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-json delivery payload and an invalid vault', async () => {
    const markup = await app.inject({
      method: 'POST',
      url: '/claims',
      headers: { authorization: `Bearer ${token}` },
      payload: { vaultContract: VAULT, lots: 1, payload: '<img src=x onerror=alert(1)>' },
    });
    expect(markup.statusCode).toBe(400);

    const badVault = await app.inject({
      method: 'POST',
      url: '/claims',
      headers: { authorization: `Bearer ${token}` },
      payload: { vaultContract: 'not-a-contract', lots: 1, payload: '{"n":"x"}' },
    });
    expect(badVault.statusCode).toBe(400);
  });
});

describe('input validation', () => {
  it('rejects an account that fails the strkey checksum', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/challenge?account=GBHASJ3VRLAXDYQQUERKD7X5EL7F7MDSPEYVIPEZK5OUFVO6WCZM6D26',
    });
    // one character off the real checksum: 400, never a 500 from the SDK
    expect(res.statusCode).toBe(400);
  });
});

describe('cors', () => {
  it('answers an allowed browser origin with the CORS headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://terwa.io' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://terwa.io');
  });

  it('leaves an unknown origin without CORS clearance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health', () => {
  it('reports ok while the ingestion cursor is fresh', async () => {
    await db.query(
      `INSERT INTO sync_cursor (contract_id, last_mercury_id, updated_at)
       VALUES ($1, 1, now())
       ON CONFLICT (contract_id) DO UPDATE SET updated_at = now()`,
      [CURSOR_CONTRACT],
    );
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.db).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.ingestLagSeconds).toBeLessThan(300);
  });

  it('degrades when the lag exceeds the staleness threshold', async () => {
    // the threshold is read per request: lowering it simulates a stale cursor
    const saved = process.env.SYNC_STALE_SECONDS;
    process.env.SYNC_STALE_SECONDS = '-1';
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.db).toBe(true);
      expect(body.ok).toBe(false);
      expect(body.lastSync).not.toBeNull();
    } finally {
      if (saved === undefined) delete process.env.SYNC_STALE_SECONDS;
      else process.env.SYNC_STALE_SECONDS = saved;
    }
  });
});
