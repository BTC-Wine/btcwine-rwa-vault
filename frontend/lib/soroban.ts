import {
  Address,
  BASE_FEE,
  Contract,
  Horizon,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { config } from "./config";

export const server = new rpc.Server(config.rpcUrl);
export const horizon = new Horizon.Server(config.horizonUrl);

export async function readContract<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<T> {
  const account = await server.getAccount(config.readerAccount);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return scValToNative(sim.result.retval) as T;
  }
  throw new Error(`lecture impossible: ${contractId} ${method}`);
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Builds the allocation purchase, ready to be signed by the buyer. */
export async function buildBuyTx(userAddress: string, allocations: number, attestationHex: string) {
  const account = await server.getAccount(userAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      new Contract(config.saleId).call(
        "buy",
        new Address(userAddress).toScVal(),
        nativeToScVal(BigInt(allocations), { type: "i128" }),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(attestationHex)))
      )
    )
    .setTimeout(120)
    .build();
  return server.prepareTransaction(tx);
}

export async function submitSigned(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error("la transaction a ete refusee par le reseau");
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await server.getTransaction(sent.hash);
    if (res.status === "SUCCESS") return sent.hash;
    if (res.status === "FAILED") {
      throw new Error("la transaction a echoue on-chain");
    }
  }
  throw new Error("delai depasse, verifiez la transaction dans l'explorateur");
}

export type ClaimData = {
  lots: bigint;
  delivery_hash: Uint8Array;
  timestamp: bigint;
  fulfilled: boolean;
} | null;

/** Etat courant d'un vault millesime : Presale, Locked, Matured ou Settled. */
export async function readVaultState(vaultId: string): Promise<string> {
  const s = await readContract<string[] | string>(vaultId, "get_state");
  return Array.isArray(s) ? String(s[0]) : String(s);
}

export async function readClaim(vaultId: string, user: string): Promise<ClaimData> {
  const c = await readContract<ClaimData>(vaultId, "get_claim", [
    new Address(user).toScVal(),
  ]);
  return c ?? null;
}

/** Montant exact de la reprise, par simulation, sans rien signer. */
export async function previewRedeem(
  vaultId: string,
  user: string,
  tokens: number
): Promise<bigint> {
  return readContractAs<bigint>(user, vaultId, "redeem", [
    new Address(user).toScVal(),
    nativeToScVal(BigInt(tokens), { type: "i128" }),
  ]);
}

async function readContractAs<T>(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<T> {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return scValToNative(sim.result.retval) as T;
  }
  throw new Error(`simulation impossible: ${method}`);
}

export async function buildRedeemTx(vaultId: string, user: string, tokens: number) {
  const account = await server.getAccount(user);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      new Contract(vaultId).call(
        "redeem",
        new Address(user).toScVal(),
        nativeToScVal(BigInt(tokens), { type: "i128" })
      )
    )
    .setTimeout(120)
    .build();
  return server.prepareTransaction(tx);
}

export async function buildClaimTx(
  vaultId: string,
  user: string,
  tokens: number,
  deliveryHashHex: string
) {
  const account = await server.getAccount(user);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      new Contract(vaultId).call(
        "claim_physical",
        new Address(user).toScVal(),
        nativeToScVal(BigInt(tokens), { type: "i128" }),
        xdr.ScVal.scvBytes(Buffer.from(hexToBytes(deliveryHashHex)))
      )
    )
    .setTimeout(120)
    .build();
  return server.prepareTransaction(tx);
}

/** Empreinte SHA-256 des coordonnees de livraison, seule donnee mise on-chain. */
export async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

export type VaultOverview = {
  state: string;
  soldLots: bigint;
  maxSupply: bigint;
  unitPrice: bigint;
  maturity: bigint;
  attestation: string;
};

export async function loadOverview(): Promise<VaultOverview> {
  const vault = config.vaultIds[0];
  const [state, soldLots, maxSupply, unitPrice, maturity, attestation] =
    await Promise.all([
      readContract<string[]>(vault, "get_state"),
      readContract<bigint>(vault, "get_sold_lots"),
      readContract<bigint>(vault, "get_max_supply"),
      readContract<bigint>(vault, "get_unit_price"),
      readContract<bigint>(vault, "get_maturity"),
      readContract<Uint8Array>(vault, "get_attestation"),
    ]);
  return {
    state: Array.isArray(state) ? String(state[0]) : String(state),
    soldLots,
    maxSupply,
    unitPrice,
    maturity,
    attestation: bytesToHex(attestation),
  };
}
