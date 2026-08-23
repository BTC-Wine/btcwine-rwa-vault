import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import pg from 'pg';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.ADMIN_TOKEN = 'admin-' + randomBytes(16).toString('hex');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const { config } = await import('../config.js');
const { buildServer } = await import('./server.js');

// Integration test against the local docker Postgres.
const db = new pg.Client({ connectionString: config.databaseUrl });
const VAULT = StrKey.encodeContract(randomBytes(32));
const WALLET = Keypair.random().publicKey();
const EMAIL = `admin-${randomBytes(4).toString('hex')}@test.local`;
const PAYLOAD = '{"name":"Test Holder","street":"1 rue du Test"}';

let app: Awaited<ReturnType<typeof buildServer>>;
let userToken: string;
let claimId: number;
let repurchaseId: number;

const admin = (extra: Record<string, unknown> = {}) => ({
  headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  ...extra,
});

beforeAll(async () => {
  await db.connect();
  app = await buildServer();
  await app.ready();
  userToken = app.jwt.sign({ sub: WALLET });
});

afterAll(async () => {
  await db.query('DELETE FROM claims WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM repurchase_requests WHERE vault_contract = $1', [VAULT]);
  await db.query('DELETE FROM admin_audit WHERE target = ANY($1)', [
    [`claims:${claimId}`, `repurchase_requests:${repurchaseId}`],
  ]);
  await db.end();
  await app.close();
});

describe('admin auth', () => {
  it('answers 404 everywhere while ADMIN_TOKEN is not configured', async () => {
    // the token is read per request: unsetting it disables the surface
    delete process.env.ADMIN_TOKEN;
    try {
      const res = await app.inject(admin({ method: 'GET', url: '/admin/claims' }));
      expect(res.statusCode).toBe(404);
    } finally {
      process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    }
  });

  it('rejects a wrong token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/claims',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin claims', () => {
  it('lists claims with the delivery payload and contact decrypted', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/claims',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { vaultContract: VAULT, lots: 2, payload: PAYLOAD, contactEmail: EMAIL },
    });
    expect(created.statusCode).toBe(200);
    claimId = created.json().id;

    const res = await app.inject(admin({ method: 'GET', url: '/admin/claims?status=draft' }));
    expect(res.statusCode).toBe(200);
    const row = res.json().claims.find((c: any) => c.id === claimId);
    expect(row.wallet).toBe(WALLET);
    expect(row.vault_contract).toBe(VAULT);
    expect(row.lots).toBe(2);
    expect(row.delivery).toBe(PAYLOAD);
    expect(row.contact_email).toBe(EMAIL);
    expect(row.delivery_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('moves onchain -> preparing and writes an audit line', async () => {
    await db.query(`UPDATE claims SET status = 'onchain' WHERE id = $1`, [claimId]);
    const res = await app.inject(
      admin({ method: 'PATCH', url: `/admin/claims/${claimId}`, payload: { status: 'preparing' } }),
    );
    expect(res.statusCode).toBe(200);
    const status = (await db.query('SELECT status FROM claims WHERE id = $1', [claimId]))
      .rows[0].status;
    expect(status).toBe('preparing');

    const audit = await db.query('SELECT action, detail FROM admin_audit WHERE target = $1', [
      `claims:${claimId}`,
    ]);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].action).toBe('claim_status');
    expect(audit.rows[0].detail).toEqual({ to: 'preparing' });
  });

  it('refuses transitions reserved to reconciliation or out of order', async () => {
    // fulfilled only ever comes from the chain
    let res = await app.inject(
      admin({ method: 'PATCH', url: `/admin/claims/${claimId}`, payload: { status: 'fulfilled' } }),
    );
    expect(res.statusCode).toBe(409);

    // preparing again would skip backwards: the row is already preparing
    res = await app.inject(
      admin({ method: 'PATCH', url: `/admin/claims/${claimId}`, payload: { status: 'preparing' } }),
    );
    expect(res.statusCode).toBe(409);

    const status = (await db.query('SELECT status FROM claims WHERE id = $1', [claimId]))
      .rows[0].status;
    expect(status).toBe('preparing');
  });
});

describe('admin repurchases', () => {
  it('walks requested -> notified -> cancelled and blocks redeemed', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/repurchases',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { vaultContract: VAULT, lots: 1, contactEmail: EMAIL },
    });
    expect(created.statusCode).toBe(200);
    repurchaseId = created.json().id;

    const list = await app.inject(admin({ method: 'GET', url: '/admin/repurchases' }));
    const row = list.json().requests.find((r: any) => r.id === repurchaseId);
    expect(row.contact_email).toBe(EMAIL);

    let res = await app.inject(
      admin({
        method: 'PATCH',
        url: `/admin/repurchases/${repurchaseId}`,
        payload: { status: 'notified' },
      }),
    );
    expect(res.statusCode).toBe(200);

    // redeemed is the reconciliation's transition, never the console's
    res = await app.inject(
      admin({
        method: 'PATCH',
        url: `/admin/repurchases/${repurchaseId}`,
        payload: { status: 'redeemed' },
      }),
    );
    expect(res.statusCode).toBe(409);

    res = await app.inject(
      admin({
        method: 'PATCH',
        url: `/admin/repurchases/${repurchaseId}`,
        payload: { status: 'cancelled' },
      }),
    );
    expect(res.statusCode).toBe(200);

    const audit = await db.query('SELECT count(*)::int AS n FROM admin_audit WHERE target = $1', [
      `repurchase_requests:${repurchaseId}`,
    ]);
    expect(audit.rows[0].n).toBe(2);
  });
});

describe('admin read views', () => {
  it('serves kyc statuses, oracle reports and the overview', async () => {
    const kyc = await app.inject(admin({ method: 'GET', url: '/admin/kyc' }));
    expect(kyc.statusCode).toBe(200);
    for (const row of kyc.json().statuses) {
      expect(Object.keys(row).sort()).toEqual(['allowlisted_tx', 'status', 'updated_at', 'wallet']);
    }

    const oracle = await app.inject(admin({ method: 'GET', url: '/admin/oracle' }));
    expect(oracle.statusCode).toBe(200);
    expect(Array.isArray(oracle.json().reports)).toBe(true);

    const overview = await app.inject(admin({ method: 'GET', url: '/admin/overview' }));
    expect(overview.statusCode).toBe(200);
    const body = overview.json();
    expect(body.claims).toBeTypeOf('object');
    expect(body.repurchases.cancelled).toBeGreaterThanOrEqual(1);
    expect(body).toHaveProperty('ingestLagSeconds');
    expect(body).toHaveProperty('lastOracleReport');
  });
});
