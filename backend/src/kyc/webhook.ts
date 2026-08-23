import { createHmac, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';

// Sumsub signs each webhook body with the shared secret; the digest and its
// algorithm travel in headers. Anything unsigned or mis-signed is dropped.

const ALGS: Record<string, string> = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

export function verifySumsubSignature(
  rawBody: Buffer,
  digestHex: string | undefined,
  algHeader: string | undefined,
  secret: string,
): boolean {
  const alg = ALGS[algHeader ?? 'HMAC_SHA256_HEX'];
  if (!alg || !digestHex) return false;
  const expected = createHmac(alg, secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(digestHex, 'hex');
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

export interface SumsubReview {
  type?: string;
  applicantId?: string;
  externalUserId?: string;
  reviewResult?: { reviewAnswer?: string };
}

/**
 * Records the review outcome. externalUserId carries the wallet address (set
 * at applicant creation). On-chain allowlisting is the worker's job: the
 * webhook only writes the database so the provider gets a fast answer.
 */
export async function recordReview(
  db: pg.Pool | pg.Client,
  review: SumsubReview,
): Promise<'approved' | 'rejected' | 'ignored'> {
  if (review.type !== 'applicantReviewed') return 'ignored';
  const wallet = review.externalUserId ?? '';
  if (!STELLAR_ACCOUNT.test(wallet) || !review.applicantId) return 'ignored';

  const status = review.reviewResult?.reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
  await db.query(
    `INSERT INTO kyc_status (wallet, provider_ref, status, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (wallet) DO UPDATE
       SET provider_ref = EXCLUDED.provider_ref, status = EXCLUDED.status,
           updated_at = now()`,
    [wallet, review.applicantId, status],
  );
  return status;
}
