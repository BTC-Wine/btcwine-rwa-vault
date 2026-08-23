// Mode demo TEMPORAIRE pour la revue UX : simule un wallet connecte sans
// extension. L'adresse est celle du compte de test testnet, qui detient de
// vraies allocations, donc toutes les lectures (cave, soldes) sont reelles.
// Seule la signature d'achat est simulee. A retirer avant le mainnet.

import type { KycInfo, RepurchaseRecord } from "./api";

export const DEMO_ADDRESS =
  "GAUUWYFJJFMQZM3AOPBYDVPXR7DR6FZ6PHPO6PVMGEGS5ZMQLGPLXC7G";

// --- Donnees d'exemple pour l'apercu du mode demo (section "Mon suivi") ---
// Valeurs entierement factices, signalees "apercu" dans l'interface. Elles
// remplacent, le temps de previsualiser l'espace connecte, les lectures qui
// exigeraient une preuve SEP-10 : aucune session n'est ouverte, aucun appel
// authentifie (/kyc, /repurchases) n'est fait quand ces donnees sont montrees.

// Statut de verification d'exemple. "none" illustre l'entree du parcours
// (achat libre, verification demandee seulement a la sortie).
export const DEMO_KYC: KycInfo = { status: "none", allowlisted: false };

// vintageIndex est resolu vers le vault reel au rendu (voir CaveSuivi), pour
// parler millesime et bouteilles plutot que contrat.
export type DemoRepurchase = Omit<RepurchaseRecord, "vault_contract"> & {
  vintageIndex: number;
};

// File de reprise d'exemple, statuts varies pour montrer le suivi.
export const DEMO_REPURCHASES: DemoRepurchase[] = [
  { id: 3, vintageIndex: 2, lots: 3, status: "requested", requested_at: "2026-08-14T09:00:00Z" },
  { id: 2, vintageIndex: 1, lots: 2, status: "notified", requested_at: "2026-08-05T09:00:00Z" },
  { id: 1, vintageIndex: 0, lots: 1, status: "funded", requested_at: "2026-07-28T09:00:00Z" },
];

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
