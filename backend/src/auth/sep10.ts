import { Keypair, WebAuth } from '@stellar/stellar-sdk';
import { config } from '../config.js';

// SEP-10 Stellar Web Authentication: the server issues a challenge
// transaction, the wallet signs it, a valid signature proves control of the
// account and earns a short-lived session token.

const CHALLENGE_TIMEOUT_S = 300;

export function buildChallenge(clientAccount: string): string {
  const server = Keypair.fromSecret(config.sep10SigningSecret());
  return WebAuth.buildChallengeTx(
    server,
    clientAccount,
    config.sep10HomeDomain,
    CHALLENGE_TIMEOUT_S,
    config.networkPassphrase,
    config.sep10WebAuthDomain,
  );
}

/** Returns the authenticated account id, or throws on any invalid input. */
export function verifyChallenge(signedChallengeXdr: string): string {
  const server = Keypair.fromSecret(config.sep10SigningSecret());
  const { clientAccountID } = WebAuth.readChallengeTx(
    signedChallengeXdr,
    server.publicKey(),
    config.networkPassphrase,
    config.sep10HomeDomain,
    config.sep10WebAuthDomain,
  );
  WebAuth.verifyChallengeTxSigners(
    signedChallengeXdr,
    server.publicKey(),
    config.networkPassphrase,
    [clientAccountID],
    config.sep10HomeDomain,
    config.sep10WebAuthDomain,
  );
  return clientAccountID;
}
