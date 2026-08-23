import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { config } from '../config.js';
import { decryptDelivery } from '../crypto/delivery.js';

// Operations endpoints for the Retool console. Access is a static bearer
// token compared in constant time; while ADMIN_TOKEN is unset every route
// answers the standard 404, so the surface is indistinguishable from absent.
// This is the only place where delivery data ever leaves the base decrypted.

const CLAIM_STATUSES = ['draft', 'onchain', 'preparing', 'shipped', 'fulfilled'];
const REPURCHASE_STATUSES = ['requested', 'notified', 'funded', 'redeemed', 'cancelled'];

// Logistics moves the console may make: target status -> required current
// status. Everything else follows the chain through reconciliation.
const CLAIM_FLOW: Record<string, string[]> = {
  preparing: ['onchain'],
  shipped: ['preparing'],
};
const REPURCHASE_FLOW: Record<string, string[]> = {
  notified: ['requested'],
  funded: ['notified'],
  cancelled: ['requested', 'notified'],
};

function tokenMatches(header: string | undefined, configured: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  // hashing both sides gives equal lengths, so the comparison never early-exits
  const got = createHash('sha256').update(header.slice(7)).digest();
  const want = createHash('sha256').update(configured).digest();
  return timingSafeEqual(got, want);
}

// Rows sealed under a rotated key stay listed, with a null payload.
function tryDecrypt(blob: Buffer | null): string | null {
  if (!blob) return null;
  try {
    return decryptDelivery(blob);
  } catch {
    return null;
  }
}

async function audit(
  db: pg.Pool,
  action: string,
  target: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.query(
    'INSERT INTO admin_audit (action, target, detail) VALUES ($1, $2, $3)',
    [action, target, JSON.stringify(detail)],
  );
}

export async function adminRoutes(
  app: FastifyInstance,
  opts: { db: pg.Pool },
): Promise<void> {
  const db = opts.db;

  app.addHook('onRequest', async (req, reply) => {
    const configured = config.adminToken();
    if (!configured) return reply.callNotFound();
    if (!tokenMatches(req.headers.authorization, configured)) {
      return reply.code(401).send({ error: 'authentication required' });
    }
  });

  app.get('/claims', async (req, reply) => {
    const status = (req.query as any).status as string | undefined;
    if (status !== undefined && !CLAIM_STATUSES.includes(status)) {
      return reply.code(400).send({ error: 'unknown status' });
    }
    const rows = await db.query(
      `SELECT id, wallet, vault_contract, lots, status,
              encode(delivery_hash, 'hex') AS delivery_hash, onchain_tx,
              delivery_ciphertext, contact_ciphertext, created_at, updated_at
       FROM claims
       WHERE $1::text IS NULL OR status = $1
       ORDER BY id DESC LIMIT 500`,
      [status ?? null],
    );
    // decrypting delivery addresses and emails is the most sensitive read in
    // the system: leave a trace of every bulk access, not just of mutations
    await audit(db, 'claims_read', 'claims', { status: status ?? null, count: rows.rowCount });
    return {
      claims: rows.rows.map(({ delivery_ciphertext, contact_ciphertext, ...row }) => ({
        ...row,
        delivery: tryDecrypt(delivery_ciphertext),
        contact_email: tryDecrypt(contact_ciphertext),
      })),
    };
  });

  app.patch('/claims/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = (req.body ?? {}) as { status?: string };
    if (!Number.isInteger(id) || !status || !CLAIM_STATUSES.includes(status)) {
      return reply.code(400).send({ error: 'known status required' });
    }
    const from = CLAIM_FLOW[status];
    if (!from) {
      return reply.code(409).send({ error: 'transition reserved to reconciliation' });
    }
    const res = await db.query(
      `UPDATE claims SET status = $1, updated_at = now()
       WHERE id = $2 AND status = ANY($3) RETURNING id`,
      [status, id, from],
    );
    if (!res.rowCount) {
      const cur = await db.query('SELECT status FROM claims WHERE id = $1', [id]);
      if (!cur.rowCount) return reply.code(404).send({ error: 'not found' });
      return reply
        .code(409)
        .send({ error: `cannot move from ${cur.rows[0].status} to ${status}` });
    }
    await audit(db, 'claim_status', `claims:${id}`, { to: status });
    return { id, status };
  });

  app.get('/repurchases', async (req, reply) => {
    const status = (req.query as any).status as string | undefined;
    if (status !== undefined && !REPURCHASE_STATUSES.includes(status)) {
      return reply.code(400).send({ error: 'unknown status' });
    }
    const rows = await db.query(
      `SELECT id, wallet, vault_contract, lots, status,
              contact_ciphertext, requested_at, updated_at
       FROM repurchase_requests
       WHERE $1::text IS NULL OR status = $1
       ORDER BY id DESC LIMIT 500`,
      [status ?? null],
    );
    await audit(db, 'repurchases_read', 'repurchase_requests', {
      status: status ?? null,
      count: rows.rowCount,
    });
    return {
      requests: rows.rows.map(({ contact_ciphertext, ...row }) => ({
        ...row,
        contact_email: tryDecrypt(contact_ciphertext),
      })),
    };
  });

  app.patch('/repurchases/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = (req.body ?? {}) as { status?: string };
    if (!Number.isInteger(id) || !status || !REPURCHASE_STATUSES.includes(status)) {
      return reply.code(400).send({ error: 'known status required' });
    }
    const from = REPURCHASE_FLOW[status];
    if (!from) {
      return reply.code(409).send({ error: 'transition reserved to reconciliation' });
    }
    const res = await db.query(
      `UPDATE repurchase_requests SET status = $1, updated_at = now()
       WHERE id = $2 AND status = ANY($3) RETURNING id`,
      [status, id, from],
    );
    if (!res.rowCount) {
      const cur = await db.query('SELECT status FROM repurchase_requests WHERE id = $1', [id]);
      if (!cur.rowCount) return reply.code(404).send({ error: 'not found' });
      return reply
        .code(409)
        .send({ error: `cannot move from ${cur.rows[0].status} to ${status}` });
    }
    await audit(db, 'repurchase_status', `repurchase_requests:${id}`, { to: status });
    return { id, status };
  });

  // Statuses only, never provider data or documents.
  app.get('/kyc', async () => {
    const rows = await db.query(
      `SELECT wallet, status, allowlisted_tx, updated_at
       FROM kyc_status ORDER BY updated_at DESC LIMIT 500`,
    );
    return { statuses: rows.rows };
  });

  app.get('/oracle', async () => {
    const rows = await db.query(
      `SELECT id, vault_contract, value, tx, status, error, created_at
       FROM oracle_reports ORDER BY id DESC LIMIT 200`,
    );
    return { reports: rows.rows };
  });

  app.get('/overview', async () => {
    const [claims, repurchases, cursor, oracle] = await Promise.all([
      db.query('SELECT status, count(*)::int AS n FROM claims GROUP BY status'),
      db.query('SELECT status, count(*)::int AS n FROM repurchase_requests GROUP BY status'),
      db.query('SELECT max(updated_at) AS last FROM sync_cursor'),
      db.query(
        `SELECT vault_contract, value, tx, status, created_at
         FROM oracle_reports ORDER BY id DESC LIMIT 1`,
      ),
    ]);
    const counts = (rows: { status: string; n: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const last: Date | null = cursor.rows[0]?.last ?? null;
    return {
      claims: counts(claims.rows),
      repurchases: counts(repurchases.rows),
      ingestLagSeconds: last ? Math.floor((Date.now() - last.getTime()) / 1000) : null,
      lastOracleReport: oracle.rows[0] ?? null,
    };
  });
}
