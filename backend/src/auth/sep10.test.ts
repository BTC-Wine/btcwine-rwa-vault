import { describe, expect, it, beforeAll } from 'vitest';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { randomBytes } from 'node:crypto';

const serverKp = Keypair.random();
process.env.SEP10_SIGNING_SECRET = serverKp.secret();
process.env.DELIVERY_KEY = randomBytes(32).toString('hex');
process.env.JWT_SECRET = 'test-secret';
process.env.MERCURY_JWT = 'unused';

const { buildChallenge, verifyChallenge } = await import('./sep10.js');
const { config } = await import('../config.js');

describe('sep10', () => {
  it('accepts a challenge signed by the client account', () => {
    const client = Keypair.random();
    const challenge = buildChallenge(client.publicKey());

    const tx = TransactionBuilder.fromXDR(challenge, config.networkPassphrase);
    tx.sign(client);

    expect(verifyChallenge(tx.toXDR())).toBe(client.publicKey());
  });

  it('rejects a challenge signed by another key', () => {
    const client = Keypair.random();
    const intruder = Keypair.random();
    const challenge = buildChallenge(client.publicKey());

    const tx = TransactionBuilder.fromXDR(challenge, config.networkPassphrase);
    tx.sign(intruder);

    expect(() => verifyChallenge(tx.toXDR())).toThrow();
  });

  it('rejects an unsigned challenge', () => {
    const client = Keypair.random();
    const challenge = buildChallenge(client.publicKey());
    expect(() => verifyChallenge(challenge)).toThrow();
  });
});
