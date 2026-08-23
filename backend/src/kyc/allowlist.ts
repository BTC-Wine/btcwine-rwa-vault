import {
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import type pg from 'pg';
import { config } from '../config.js';

// Pushes KYC outcomes on-chain with the dedicated allowlist manager key, the
// low-privilege role that can only allow or revoke addresses. Approval opens
// the exits on every vintage vault; a later rejection revokes them.

async function submitSetAllowed(
  vault: string,
  addr: string,
  status: boolean,
): Promise<string> {
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const manager = Keypair.fromSecret(config.allowlistSecret());
  const account = await server.getAccount(manager.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      new Contract(vault).call(
        'set_allowed',
        nativeToScVal(addr, { type: 'address' }),
        nativeToScVal(status),
      ),
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(manager);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`set_allowed rejected: ${JSON.stringify(sent.errorResult)}`);
  }
  const confirmed = await server.pollTransaction(sent.hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`transaction ${sent.hash} ended ${confirmed.status}`);
  }
  return sent.hash;
}

/**
 * Worker step: allowlists approved wallets that are not on-chain yet, and
 * revokes wallets whose approval was withdrawn. Retries come for free with
 * the next tick. Skips silently when no manager key is configured (local
 * development without a chain).
 */
export async function processAllowlist(db: pg.Pool | pg.Client): Promise<number> {
  if (!process.env.ALLOWLIST_SECRET) return 0;
  let changes = 0;

  const pending = await db.query(
    `SELECT wallet FROM kyc_status WHERE status = 'approved' AND allowlisted_tx IS NULL`,
  );
  for (const { wallet } of pending.rows) {
    let lastTx = '';
    for (const vault of config.vaultContracts) {
      lastTx = await submitSetAllowed(vault, wallet, true);
    }
    await db.query(
      `UPDATE kyc_status SET allowlisted_tx = $2, updated_at = now() WHERE wallet = $1`,
      [wallet, lastTx],
    );
    changes++;
  }

  const revoked = await db.query(
    `SELECT wallet FROM kyc_status WHERE status = 'rejected' AND allowlisted_tx IS NOT NULL`,
  );
  for (const { wallet } of revoked.rows) {
    for (const vault of config.vaultContracts) {
      await submitSetAllowed(vault, wallet, false);
    }
    await db.query(
      `UPDATE kyc_status SET allowlisted_tx = NULL, updated_at = now() WHERE wallet = $1`,
      [wallet],
    );
    changes++;
  }
  return changes;
}
