import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { config } from "./config";
import { horizon } from "./soroban";
import { signTx } from "./wallet";

export type Balances = Record<string, string>;

/** Classic asset balances of the account, keyed by asset code. */
export async function loadBalances(address: string): Promise<Balances> {
  const account = await horizon.loadAccount(address);
  const out: Balances = {};
  for (const b of account.balances) {
    if ("asset_code" in b && b.asset_issuer === config.issuer) {
      out[b.asset_code] = b.balance;
    }
    if (b.asset_type === "native") out.XLM = b.balance;
  }
  return out;
}

/** Opens the missing trustlines for the vintage tokens, in one transaction. */
export async function ensureTrustlines(address: string): Promise<boolean> {
  const balances = await loadBalances(address);
  const requis = [...config.tokenCodes, config.usdmCode];
  const missing = requis.filter((code) => !(code in balances));
  if (missing.length === 0) return false;

  const account = await horizon.loadAccount(address);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  });
  for (const code of missing) {
    builder.addOperation(
      Operation.changeTrust({ asset: new Asset(code, config.issuer) })
    );
  }
  const tx = builder.setTimeout(120).build();
  const signed = await signTx(tx.toXDR(), address);
  await horizon.submitTransaction(
    TransactionBuilder.fromXDR(signed, config.networkPassphrase)
  );
  return true;
}
