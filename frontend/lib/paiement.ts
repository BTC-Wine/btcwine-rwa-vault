import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { config } from "./config";
import { horizon } from "./soroban";
import { signTx } from "./wallet";

// Actifs de paiement proposes : uniquement des actifs liquides majeurs du
// reseau Stellar. Le reglement final reste toujours en stablecoin dollar :
// les autres actifs sont convertis dans le wallet de l'acheteur via un path
// payment (DEX natif), avant l'achat. TERWA ne recoit jamais autre chose que
// le stablecoin.
export type PaymentAsset = {
  code: string;
  label: string;
  direct: boolean; // true = stablecoin du contrat, aucun swap
  asset: () => Asset;
};

export const PAYMENT_ASSETS: PaymentAsset[] = [
  {
    code: config.usdmCode,
    label: "USDC",
    direct: true,
    asset: () => new Asset(config.usdmCode, config.issuer),
  },
  {
    code: "XLM",
    label: "XLM",
    direct: false,
    asset: () => Asset.native(),
  },
];

const SLIPPAGE = 1.01; // 1 % maximum

/** Meilleur chemin DEX pour recevoir exactement `usdcAmount` de stablecoin. */
export async function quoteSwap(source: PaymentAsset, usdcAmount: number) {
  const dest = new Asset(config.usdmCode, config.issuer);
  const paths = await horizon
    .strictReceivePaths([source.asset()], dest, usdcAmount.toFixed(7))
    .call();
  if (!paths.records.length) {
    throw new Error(
      `pas assez de liquidité sur le DEX pour payer en ${source.label} pour le moment`
    );
  }
  const best = paths.records.reduce((a, b) =>
    Number(a.source_amount) <= Number(b.source_amount) ? a : b
  );
  return {
    sourceAmount: Number(best.source_amount),
    sendMax: (Number(best.source_amount) * SLIPPAGE).toFixed(7),
    path: best.path.map((p) =>
      p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code, p.asset_issuer)
    ),
  };
}

/** Convertit l'actif choisi en stablecoin, dans le compte de l'acheteur. */
export async function swapToUsdc(
  address: string,
  source: PaymentAsset,
  usdcAmount: number
): Promise<void> {
  const quote = await quoteSwap(source, usdcAmount);
  const account = await horizon.loadAccount(address);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: source.asset(),
        sendMax: quote.sendMax,
        destination: address,
        destAsset: new Asset(config.usdmCode, config.issuer),
        destAmount: usdcAmount.toFixed(7),
        path: quote.path,
      })
    )
    .setTimeout(120)
    .build();
  const signed = await signTx(tx.toXDR(), address);
  await horizon.submitTransaction(
    TransactionBuilder.fromXDR(signed, config.networkPassphrase)
  );
}
