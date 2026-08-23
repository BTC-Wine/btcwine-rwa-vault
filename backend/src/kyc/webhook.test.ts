import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import pg from 'pg';

process.env.MERCURY_JWT ??= 'unused';
process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');

const { config } = await import('../config.js');
const { recordReview, verifySumsubSignature } = await import('./webhook.js');

const SECRET = 'test-webhook-secret';
const WALLET = 'G' + 'KYCA'.repeat(13) + 'KYC';

function sign(body: string, alg = 'sha256'): string {
  return createHmac(alg, SECRET).update(body).digest('hex');
}

describe('verifySumsubSignature', () => {
  const body = Buffer.from('{"type":"applicantReviewed"}');

  it('accepts a valid sha256 digest', () => {
    expect(verifySumsubSignature(body, sign(body.toString()), 'HMAC_SHA256_HEX', SECRET)).toBe(true);
  });

  it('accepts a valid sha512 digest', () => {
    expect(
      verifySumsubSignature(body, sign(body.toString(), 'sha512'), 'HMAC_SHA512_HEX', SECRET),
    ).toBe(true);
  });

  it('rejects a wrong secret, a tampered body and a missing digest', () => {
    const other = createHmac('sha256', 'wrong').update(body).digest('hex');
    expect(verifySumsubSignature(body, other, 'HMAC_SHA256_HEX', SECRET)).toBe(false);
    expect(
      verifySumsubSignature(Buffer.from('{"tampered":1}'), sign(body.toString()), 'HMAC_SHA256_HEX', SECRET),
    ).toBe(false);
    expect(verifySumsubSignature(body, undefined, 'HMAC_SHA256_HEX', SECRET)).toBe(false);
    expect(verifySumsubSignature(body, sign(body.toString()), 'UNKNOWN_ALG', SECRET)).toBe(false);
  });
});

describe('recordReview', () => {
  const db = new pg.Client({ connectionString: config.databaseUrl });

  beforeAll(async () => {
    await db.connect();
  });
  afterAll(async () => {
    await db.query('DELETE FROM kyc_status WHERE wallet = $1', [WALLET]);
    await db.end();
  });

  it('stores approval, then downgrades to rejected on a new review', async () => {
    const approved = await recordReview(db, {
      type: 'applicantReviewed',
      applicantId: 'app-1',
      externalUserId: WALLET,
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    expect(approved).toBe('approved');
    let row = (await db.query('SELECT status FROM kyc_status WHERE wallet = $1', [WALLET])).rows[0];
    expect(row.status).toBe('approved');

    const rejected = await recordReview(db, {
      type: 'applicantReviewed',
      applicantId: 'app-1',
      externalUserId: WALLET,
      reviewResult: { reviewAnswer: 'RED' },
    });
    expect(rejected).toBe('rejected');
    row = (await db.query('SELECT status FROM kyc_status WHERE wallet = $1', [WALLET])).rows[0];
    expect(row.status).toBe('rejected');
  });

  it('ignores other webhook types and bad wallets', async () => {
    expect(await recordReview(db, { type: 'applicantCreated', externalUserId: WALLET })).toBe('ignored');
    expect(
      await recordReview(db, {
        type: 'applicantReviewed',
        applicantId: 'app-2',
        externalUserId: 'not-a-wallet',
        reviewResult: { reviewAnswer: 'GREEN' },
      }),
    ).toBe('ignored');
  });
});
