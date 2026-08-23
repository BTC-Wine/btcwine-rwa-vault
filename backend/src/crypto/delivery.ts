import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

// AES-256-GCM at the application level: the database and its backups only
// ever see ciphertext. Layout: 12-byte IV | 16-byte tag | ciphertext.

function key(): Buffer {
  const k = Buffer.from(config.deliveryKeyHex(), 'hex');
  if (k.length !== 32) throw new Error('DELIVERY_KEY must be 32 bytes of hex');
  return k;
}

export function encryptDelivery(payload: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptDelivery(blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/**
 * The exact bytes the wallet hashed client side go on-chain: hash the
 * received payload string as is, never a re-serialization of it.
 */
export function deliveryHash(payload: string): Buffer {
  return createHash('sha256').update(payload, 'utf8').digest();
}
