import {
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';
import pg from 'pg';
import { config } from '../config.js';

// Annual appraisal submission. The value is indicative only and the contract
// bounds it to half/double the previous one; this service just carries the
// expert's number on-chain with retries and an audit trail.

const MAX_ATTEMPTS = 4;

async function submitOnce(vaultContract: string, value: bigint): Promise<string> {
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  const oracle = Keypair.fromSecret(config.oracleSecret());
  const account = await server.getAccount(oracle.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      new Contract(vaultContract).call(
        'report_rwa_value',
        nativeToScVal(value, { type: 'i128' }),
      ),
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(oracle);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`submission rejected: ${JSON.stringify(sent.errorResult)}`);
  }
  const confirmed = await server.pollTransaction(sent.hash);
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`transaction ${sent.hash} ended ${confirmed.status}`);
  }
  return sent.hash;
}

export async function reportValue(vaultContract: string, value: bigint): Promise<string> {
  const db = new pg.Client({ connectionString: config.databaseUrl });
  await db.connect();
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const tx = await submitOnce(vaultContract, value);
        await db.query(
          `INSERT INTO oracle_reports (vault_contract, value, tx, status)
           VALUES ($1, $2, $3, 'submitted')`,
          [vaultContract, value.toString(), tx],
        );
        return tx;
      } catch (err) {
        lastError = err;
        console.error(`attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    await db.query(
      `INSERT INTO oracle_reports (vault_contract, value, status, error)
       VALUES ($1, $2, 'failed', $3)`,
      [vaultContract, value.toString(), String(lastError)],
    );
    throw lastError;
  } finally {
    await db.end();
  }
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [vault, value] = process.argv.slice(2);
  if (!vault || !value) {
    console.error('usage: tsx src/oracle/report.ts <vault_contract> <value>');
    process.exit(1);
  }
  const tx = await reportValue(vault, BigInt(value));
  console.log(`submitted, tx ${tx}`);
}
