function req(name: string, value: string | undefined): string {
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

const list = (v: string) => v.split(",").filter(Boolean);

export const config = {
  networkPassphrase: req(
    "NEXT_PUBLIC_NETWORK_PASSPHRASE",
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE
  ),
  rpcUrl: req("NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL),
  horizonUrl: req("NEXT_PUBLIC_HORIZON_URL", process.env.NEXT_PUBLIC_HORIZON_URL),
  saleId: req("NEXT_PUBLIC_SALE_ID", process.env.NEXT_PUBLIC_SALE_ID),
  vaultIds: list(req("NEXT_PUBLIC_VAULT_IDS", process.env.NEXT_PUBLIC_VAULT_IDS)),
  tokenIds: list(req("NEXT_PUBLIC_TOKEN_IDS", process.env.NEXT_PUBLIC_TOKEN_IDS)),
  tokenCodes: list(req("NEXT_PUBLIC_TOKEN_CODES", process.env.NEXT_PUBLIC_TOKEN_CODES)),
  vintages: list(req("NEXT_PUBLIC_VINTAGES", process.env.NEXT_PUBLIC_VINTAGES)),
  issuer: req("NEXT_PUBLIC_ISSUER", process.env.NEXT_PUBLIC_ISSUER),
  usdmCode: req("NEXT_PUBLIC_USDM_CODE", process.env.NEXT_PUBLIC_USDM_CODE),
  readerAccount: req(
    "NEXT_PUBLIC_READER_ACCOUNT",
    process.env.NEXT_PUBLIC_READER_ACCOUNT
  ),
};

export const TOKENS_PER_ALLOCATION = 5;
export const BOTTLES_PER_TOKEN = 3;
export const STROOPS = 10_000_000n;
