import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// Secrets pasted into dashboards routinely pick up a stray newline or space;
// none of ours legitimately contains whitespace, so strip it everywhere.
function required(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

export const config = {
  // chain event source for the worker: mercury (default) or rpc (getEvents,
  // for networks Mercury does not index, the local quickstart mainly)
  eventsSource: process.env.EVENTS_SOURCE ?? 'mercury',
  mercuryBaseUrl: process.env.MERCURY_BASE_URL ?? 'https://testnet.mercurydata.app/rest',
  mercuryJwt: () => required('MERCURY_JWT'),
  deliveryKeyHex: () => required('DELIVERY_KEY'),
  jwtSecret: () => required('JWT_SECRET'),
  sep10SigningSecret: () => required('SEP10_SIGNING_SECRET'),
  sep10HomeDomain: process.env.SEP10_HOME_DOMAIN ?? 'terwa.io',
  sep10WebAuthDomain: process.env.SEP10_WEB_AUTH_DOMAIN ?? 'api.terwa.io',
  networkPassphrase: process.env.NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  rpcUrl: process.env.RPC_URL ?? 'https://soroban-testnet.stellar.org',
  horizonUrl: process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
  oracleSecret: () => required('ORACLE_SECRET'),
  allowlistSecret: () => required('ALLOWLIST_SECRET'),
  sumsubWebhookSecret: () => required('SUMSUB_WEBHOOK_SECRET'),
  sumsubAppToken: () => required('SUMSUB_APP_TOKEN'),
  sumsubAppSecret: () => required('SUMSUB_APP_SECRET'),
  sumsubApiUrl: process.env.SUMSUB_API_URL ?? 'https://api.sumsub.com',
  sumsubLevel: process.env.SUMSUB_LEVEL ?? 'id-and-liveness',
  // browser origins allowed by CORS, comma separated
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'https://terwa.io,https://www.terwa.io,https://terwa.netlify.app,http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // notifications: without a token the dev transport journals instead of sending
  postmarkToken: process.env.POSTMARK_TOKEN ?? '',
  notifyFrom: process.env.NOTIFY_FROM || 'TERWA <cave@terwa.io>',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://terwa:terwa@localhost:5433/terwa',
  port: Number(process.env.PORT ?? 3001),
  // ingestion is considered stale past this lag; read per call so probes can tune it
  syncStaleSeconds: () => Number(process.env.SYNC_STALE_SECONDS || 300),
  // ops console bearer: unset or empty keeps every /admin route on 404
  adminToken: () => process.env.ADMIN_TOKEN ?? '',
  // contract ids of the current deployment, comma separated
  vaultContracts: (process.env.VAULT_CONTRACTS ?? '').split(',').filter(Boolean),
  tokenContracts: (process.env.TOKEN_CONTRACTS ?? '').split(',').filter(Boolean),
  saleContract: process.env.SALE_CONTRACT ?? '',
};
