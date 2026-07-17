import type { Networks } from "@creit.tech/stellar-wallets-kit/types";
import { config } from "./config";

// import dynamique obligatoire : le kit pose ses variables --swk-* sur <html>
// des l'evaluation du module, ce qui casse l'hydratation SSR si importe statiquement
type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let kitPromise: Promise<Kit> | null = null;

function getKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
    ]).then(([{ StellarWalletsKit }, { defaultModules }]) => {
      StellarWalletsKit.init({
        modules: defaultModules(),
        network: config.networkPassphrase as Networks,
      });
      return StellarWalletsKit;
    });
  }
  return kitPromise;
}

export async function connectWallet(): Promise<string> {
  const kit = await getKit();
  const { address } = await kit.authModal();
  return address;
}

export async function disconnectWallet(): Promise<void> {
  if (kitPromise) await (await kitPromise).disconnect();
}

export async function signTx(xdr: string, address: string): Promise<string> {
  const kit = await getKit();
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    networkPassphrase: config.networkPassphrase,
    address,
  });
  return signedTxXdr;
}
