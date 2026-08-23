import { createHmac } from 'node:crypto';
import { config } from '../config.js';

// Sumsub app token authentication: every request carries the app token, a
// unix timestamp and an HMAC-SHA256 signature of ts + METHOD + path (query
// string included) + body, hex lowercase, keyed with the secret key.

export function sumsubSignature(
  secret: string,
  ts: number,
  method: string,
  pathWithQuery: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${ts}${method}${pathWithQuery}${body}`)
    .digest('hex');
}

/** True when the app token pair is present, so the session route can 503 cleanly. */
export function sumsubConfigured(): boolean {
  return Boolean(
    (process.env.SUMSUB_APP_TOKEN ?? '').trim() && (process.env.SUMSUB_APP_SECRET ?? '').trim(),
  );
}

const TOKEN_PATH = '/resources/accessTokens/sdk';
const TOKEN_TTL_S = 600;

/**
 * Creates a WebSDK access token bound to the wallet (the applicant's
 * externalUserId, matching what the webhook reads back after review).
 */
export async function createSdkToken(wallet: string): Promise<string> {
  const body = JSON.stringify({
    userId: wallet,
    levelName: config.sumsubLevel,
    ttlInSecs: TOKEN_TTL_S,
  });
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(config.sumsubApiUrl + TOKEN_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': config.sumsubAppToken(),
      'X-App-Access-Ts': String(ts),
      'X-App-Access-Sig': sumsubSignature(config.sumsubAppSecret(), ts, 'POST', TOKEN_PATH, body),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`sumsub access token request failed: ${res.status}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error('sumsub response carries no token');
  return data.token;
}
