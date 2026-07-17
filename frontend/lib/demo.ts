// Mode demo TEMPORAIRE pour la revue UX : simule un wallet connecte sans
// extension. L'adresse est celle du compte de test testnet, qui detient de
// vraies allocations, donc toutes les lectures (cave, soldes) sont reelles.
// Seule la signature d'achat est simulee. A retirer avant le mainnet.

export const DEMO_ADDRESS =
  "GAUUWYFJJFMQZM3AOPBYDVPXR7DR6FZ6PHPO6PVMGEGS5ZMQLGPLXC7G";

const KEY = "terwa-demo";

export function isDemo(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(KEY) === "1";
}

export function toggleDemo(): void {
  if (isDemo()) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, "1");
  }
  window.location.reload();
}
