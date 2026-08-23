import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';

process.env.DELIVERY_KEY ??= randomBytes(32).toString('hex');
process.env.MERCURY_JWT ??= 'unused';

const { decryptDelivery, deliveryHash, encryptDelivery } = await import('./delivery.js');

describe('delivery crypto', () => {
  it('round-trips a payload', () => {
    const payload = JSON.stringify({ name: 'Jean', city: 'Bordeaux', nonce: 'abc123' });
    const blob = encryptDelivery(payload);
    expect(blob.length).toBeGreaterThan(28);
    expect(blob.includes(Buffer.from('Bordeaux'))).toBe(false);
    expect(decryptDelivery(blob)).toBe(payload);
  });

  it('refuses tampered ciphertext', () => {
    const blob = encryptDelivery('secret');
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptDelivery(blob)).toThrow();
  });

  it('hashes the exact payload string, matching the frontend convention', () => {
    // the frontend hashes the JSON string with subtle-crypto SHA-256 and
    // sends that hash on-chain: the backend must reproduce it byte for byte
    const payload = '{"name":"Jean","wallet":"GABC","nonce":"xyz"}';
    const expected = createHash('sha256').update(payload, 'utf8').digest('hex');
    expect(deliveryHash(payload).toString('hex')).toBe(expected);
  });
});
