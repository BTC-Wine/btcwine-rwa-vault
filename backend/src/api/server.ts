import Fastify, { type FastifyError } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import * as Sentry from '@sentry/node';
import pg from 'pg';
import { StrKey } from '@stellar/stellar-sdk';
import { config } from '../config.js';
import { buildChallenge, verifyChallenge } from '../auth/sep10.js';
import { deliveryHash, encryptDelivery } from '../crypto/delivery.js';
import { createSdkToken, sumsubConfigured } from '../kyc/session.js';
import { recordReview, verifySumsubSignature } from '../kyc/webhook.js';
import { adminRoutes } from './admin.js';

// full StrKey validation: the checksum matters, a shape-only regex lets
// invalid addresses through to the SDK where they blow up as 500s
const isAccount = (v: string) => StrKey.isValidEd25519PublicKey(v);
const isContract = (v: string) => StrKey.isValidContract(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A delivery payload must decode to a plain JSON object, never a scalar,
// array or malformed blob.
function isJsonObject(s: string): boolean {
  try {
    const v = JSON.parse(s);
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  } catch {
    return false;
  }
}

// Error tracking is opt-in: without a DSN the SDK is never initialized and
// every capture call below is a no-op.
if (process.env.SENTRY_DSN) Sentry.init({ dsn: process.env.SENTRY_DSN });

export async function buildServer() {
  // trustProxy: Render and Cloudflare sit in front, so the client IP the rate
  // limiter keys on comes from X-Forwarded-For, not the proxy socket.
  const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 64 * 1024 });
  const db = new pg.Pool({ connectionString: config.databaseUrl });

  // Security headers. No HTML is served, so CSP is unnecessary, but nosniff,
  // HSTS and frame denial are cheap defense in depth on the JSON surface.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    hsts: { maxAge: 15552000, includeSubDomains: true },
  });

  // Baseline rate limit per client IP; hot or costly routes tighten it below.
  // Key on Cloudflare's connecting-ip header, which fronts Render and is
  // overwritten by Cloudflare (so it cannot be forged), instead of the
  // leftmost X-Forwarded-For entry a client could spoof. Falls back to the
  // socket ip if the header is absent. Per-route limits inherit this key.
  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['cf-connecting-ip'] as string) || req.ip,
  });

  // Browser clients live on other origins (Netlify, terwa.io); the webhook
  // and server-to-server callers simply never send an Origin header.
  await app.register(fastifyCors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  await app.register(fastifyJwt, {
    secret: config.jwtSecret(),
    sign: { algorithm: 'HS256', iss: 'terwa-api', aud: 'terwa-api', expiresIn: '1h' },
    verify: { algorithms: ['HS256'], allowedIss: 'terwa-api', allowedAud: 'terwa-api' },
  });
  app.addHook('onClose', () => db.end());

  // Per-route limits: a stricter cap keyed by IP for the costly or abusable
  // endpoints (Sumsub session creation is billed, auth and writes are spammable).
  const tight = (max: number, timeWindow: string) => ({
    config: { rateLimit: { max, timeWindow } },
  });

  // Operations console (Retool): fully disabled without ADMIN_TOKEN.
  await app.register(adminRoutes, { prefix: '/admin', db });

  const requireAuth = async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'authentication required' });
    }
  };

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    req.log.error({ err }, 'request failed');
    reply.code(err.statusCode ?? 500).send({ error: 'internal error' });
  });

  // Uptime probe: degraded when the database is unreachable or the ingestion
  // cursor has not moved within SYNC_STALE_SECONDS.
  app.get('/health', async () => {
    let dbOk = true;
    let last: Date | null = null;
    try {
      const cur = await db.query('SELECT max(updated_at) AS last FROM sync_cursor');
      last = cur.rows[0]?.last ?? null;
    } catch {
      dbOk = false;
    }
    const lag = last ? Math.floor((Date.now() - last.getTime()) / 1000) : null;
    // no contracts configured means nothing to sync, so nothing can be stale
    const nothingToSync =
      config.vaultContracts.length === 0 &&
      config.tokenContracts.length === 0 &&
      !config.saleContract;
    const fresh = nothingToSync || (lag !== null && lag <= config.syncStaleSeconds());
    return { ok: dbOk && fresh, lastSync: last, ingestLagSeconds: lag, db: dbOk };
  });

  // SEP-10

  app.get('/auth/challenge', tight(30, '1 minute'), async (req, reply) => {
    const account = String((req.query as any).account ?? '');
    if (!isAccount(account)) {
      return reply.code(400).send({ error: 'invalid account' });
    }
    return {
      transaction: buildChallenge(account),
      network_passphrase: config.networkPassphrase,
    };
  });

  app.post('/auth/token', async (req, reply) => {
    const { transaction } = (req.body ?? {}) as { transaction?: string };
    if (!transaction) return reply.code(400).send({ error: 'transaction required' });
    try {
      const account = verifyChallenge(transaction);
      return { token: app.jwt.sign({ sub: account }) };
    } catch (err) {
      req.log.info({ err }, 'sep10 challenge rejected');
      return reply.code(401).send({ error: 'invalid challenge' });
    }
  });

  // Read API, backed by the Mercury mirror

  app.get('/history/:wallet', async (req, reply) => {
    const wallet = String((req.params as any).wallet);
    if (!isAccount(wallet)) {
      return reply.code(400).send({ error: 'invalid account' });
    }
    const rows = await db.query(
      `SELECT contract_id, kind, topics, data, tx, ledger_ts
       FROM chain_events
       WHERE topics @> to_jsonb(ARRAY[$1::text])
       ORDER BY mercury_id DESC
       LIMIT 200`,
      [wallet],
    );
    return { wallet, events: rows.rows };
  });

  app.get('/stats', tight(30, '1 minute'), async () => {
    const rows = await db.query(
      `SELECT contract_id, kind, count(*)::int AS n
       FROM chain_events GROUP BY contract_id, kind`,
    );
    return { counts: rows.rows };
  });

  // Delivery claims: ciphertext at rest, only the hash goes on-chain.

  app.post('/claims', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const wallet = String((req.user as any).sub);
    const { vaultContract, lots, payload, contactEmail } = (req.body ?? {}) as {
      vaultContract?: string;
      lots?: number;
      payload?: string;
      contactEmail?: string;
    };
    if (!vaultContract || !payload || !Number.isInteger(lots) || lots! <= 0) {
      return reply.code(400).send({ error: 'vaultContract, lots and payload required' });
    }
    if (!isContract(vaultContract)) {
      return reply.code(400).send({ error: 'invalid vaultContract' });
    }
    // the payload is opaque delivery data hashed client side; bound its size and
    // require well-formed JSON so no arbitrary blob (or markup that the ops
    // console might render) is ever stored under a holder's name
    if (payload.length > 8192 || !isJsonObject(payload)) {
      return reply.code(400).send({ error: 'payload must be a json object under 8kb' });
    }
    if (contactEmail !== undefined && !EMAIL.test(contactEmail)) {
      return reply.code(400).send({ error: 'invalid contactEmail' });
    }
    const hash = deliveryHash(payload);
    const row = await db.query(
      `INSERT INTO claims (wallet, vault_contract, lots, delivery_ciphertext, delivery_hash, contact_ciphertext)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [wallet, vaultContract, lots, encryptDelivery(payload), hash,
       contactEmail ? encryptDelivery(contactEmail) : null],
    );
    return { id: row.rows[0].id, deliveryHashHex: hash.toString('hex') };
  });

  app.get('/claims/mine', { preHandler: requireAuth }, async (req) => {
    const wallet = String((req.user as any).sub);
    const rows = await db.query(
      `SELECT id, vault_contract, lots, encode(delivery_hash, 'hex') AS delivery_hash,
              onchain_tx, status, created_at
       FROM claims WHERE wallet = $1 ORDER BY id DESC`,
      [wallet],
    );
    return { claims: rows.rows };
  });

  // Sumsub webhook: signature checked on the raw body, database write only,
  // the worker carries approvals on-chain.

  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );
    scope.post('/kyc/webhook', async (req, reply) => {
      const raw = req.body as Buffer;
      const ok = verifySumsubSignature(
        raw,
        req.headers['x-payload-digest'] as string | undefined,
        req.headers['x-payload-digest-alg'] as string | undefined,
        config.sumsubWebhookSecret(),
      );
      if (!ok) return reply.code(401).send({ error: 'bad signature' });
      let review;
      try {
        review = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'invalid json' });
      }
      const outcome = await recordReview(db, review);
      req.log.info({ outcome, type: review.type }, 'kyc webhook');
      return { ok: true };
    });
  });

  // Sumsub WebSDK session: a short-lived access token bound to the wallet,
  // for the in-site verification flow. Without the app token pair (local dev)
  // the route degrades to 503 instead of failing at startup.
  app.post('/kyc/session', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (!sumsubConfigured()) {
      return reply.code(503).send({ error: 'verification unavailable' });
    }
    const wallet = String((req.user as any).sub);
    try {
      const token = await createSdkToken(wallet);
      return { token, level: config.sumsubLevel };
    } catch (err) {
      req.log.error({ err }, 'sumsub session failed');
      return reply.code(502).send({ error: 'verification provider error' });
    }
  });

  app.get('/kyc/mine', { preHandler: requireAuth }, async (req) => {
    const wallet = String((req.user as any).sub);
    const row = await db.query(
      `SELECT status, allowlisted_tx IS NOT NULL AS allowlisted
       FROM kyc_status WHERE wallet = $1`,
      [wallet],
    );
    return row.rows[0] ?? { status: 'none', allowlisted: false };
  });

  // Producer repurchase queue: settled on demand, never guaranteed.

  app.post('/repurchases', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const wallet = String((req.user as any).sub);
    const { vaultContract, lots, contactEmail } = (req.body ?? {}) as {
      vaultContract?: string;
      lots?: number;
      contactEmail?: string;
    };
    if (!vaultContract || !Number.isInteger(lots) || lots! <= 0) {
      return reply.code(400).send({ error: 'vaultContract and lots required' });
    }
    if (!isContract(vaultContract)) {
      return reply.code(400).send({ error: 'invalid vaultContract' });
    }
    if (contactEmail !== undefined && !EMAIL.test(contactEmail)) {
      return reply.code(400).send({ error: 'invalid contactEmail' });
    }
    const row = await db.query(
      `INSERT INTO repurchase_requests (wallet, vault_contract, lots, contact_ciphertext)
       VALUES ($1, $2, $3, $4) RETURNING id, status, requested_at`,
      [wallet, vaultContract, lots, contactEmail ? encryptDelivery(contactEmail) : null],
    );
    return row.rows[0];
  });

  app.get('/repurchases/mine', { preHandler: requireAuth }, async (req) => {
    const wallet = String((req.user as any).sub);
    const rows = await db.query(
      `SELECT id, vault_contract, lots, status, requested_at
       FROM repurchase_requests WHERE wallet = $1 ORDER BY id DESC`,
      [wallet],
    );
    return { requests: rows.rows };
  });

  return app;
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = await buildServer();
  app.listen({ port: config.port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
