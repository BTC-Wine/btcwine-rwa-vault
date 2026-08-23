// Client de l'API backend (indexeur, claims, reprises, KYC) avec
// authentification SEP-10 : le serveur emet une transaction de defi, le
// wallet la signe, la signature vaut preuve de controle de l'adresse et
// s'echange contre un JWT court (1 h).
//
// Toutes les fonctions sont non bloquantes : une API absente ou en erreur
// renvoie null, jamais d'exception. Les pages restent utilisables sans
// backend (fallback silencieux vers le comportement historique).

import { TransactionBuilder } from "@stellar/stellar-sdk";
import { signTx } from "./wallet";
import { config } from "./config";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3210";

/**
 * Ne jamais signer a l'aveugle ce que le backend renvoie : un serveur
 * compromis pourrait presenter une transaction qui deplace des fonds a la
 * place du defi SEP-10. Un vrai defi a une sequence nulle, une source qui
 * n'est pas l'utilisateur, et uniquement des operations manage_data. Toute
 * transaction qui s'en ecarte est refusee avant d'atteindre le wallet.
 */
function looksLikeSep10Challenge(xdrTx: string, address: string): boolean {
  try {
    const tx = TransactionBuilder.fromXDR(xdrTx, config.networkPassphrase);
    if ("innerTransaction" in tx) return false; // pas de fee-bump
    if (tx.sequence !== "0") return false;
    if (tx.source === address) return false;
    if (tx.operations.length === 0) return false;
    return tx.operations.every((op) => op.type === "manageData");
  } catch {
    return false;
  }
}

// Timeout court : l'API absente ne doit pas faire attendre l'interface.
const TIMEOUT_MS = 8000;

export type KycInfo = {
  status: "none" | "pending" | "approved" | "rejected";
  allowlisted: boolean;
};

export type ClaimRecord = {
  id: number;
  vault_contract: string;
  lots: number;
  delivery_hash: string;
  onchain_tx: string | null;
  status: "draft" | "onchain" | "preparing" | "shipped" | "fulfilled";
  created_at: string;
};

export type RepurchaseRecord = {
  id: number;
  vault_contract: string;
  lots: number;
  status: "requested" | "notified" | "funded" | "redeemed" | "cancelled";
  requested_at: string;
};

export type ChainEvent = {
  contract_id: string;
  kind: string;
  topics: unknown[];
  data: unknown;
  tx: string;
};

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
    };
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`api ${path}: ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// --- Session SEP-10, un token par adresse, cache en memoire seulement ---

type Session = { token: string; expiresAt: number };

const sessions = new Map<string, Session>();
const pending = new Map<string, Promise<string | null>>();

function jwtExpiry(token: string): number {
  // La date d'expiration vit dans le payload du JWT ; a defaut on prend
  // une marge prudente sous la duree emise par le serveur (1 h).
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    // payload illisible : marge par defaut ci-dessous
  }
  return Date.now() + 55 * 60 * 1000;
}

/** Token en cache encore valide, sans aucune interaction wallet. */
export function getSession(address: string): string | null {
  const s = sessions.get(address);
  if (!s) return null;
  // 60 s de marge : ne pas partir avec un token qui expire en vol
  if (Date.now() > s.expiresAt - 60_000) {
    sessions.delete(address);
    return null;
  }
  return s.token;
}

/**
 * Authentification complete : defi SEP-10, signature par le wallet,
 * echange contre le JWT. Ouvre la fenetre de signature du wallet.
 */
export async function authenticate(address: string): Promise<string | null> {
  const cached = getSession(address);
  if (cached) return cached;
  // Une seule authentification a la fois par adresse
  const inFlight = pending.get(address);
  if (inFlight) return inFlight;

  const flow = (async () => {
    try {
      const challenge = await request<{ transaction: string }>(
        `/auth/challenge?account=${address}`
      );
      if (!challenge) return null;
      if (!looksLikeSep10Challenge(challenge.transaction, address)) {
        // le serveur n'a pas renvoye un defi conforme : ne rien signer
        return null;
      }
      const signed = await signTx(challenge.transaction, address);
      const res = await request<{ token: string }>("/auth/token", {
        method: "POST",
        body: JSON.stringify({ transaction: signed }),
      });
      if (!res) return null;
      sessions.set(address, { token: res.token, expiresAt: jwtExpiry(res.token) });
      return res.token;
    } catch {
      // signature refusee ou wallet indisponible : pas de session
      return null;
    } finally {
      pending.delete(address);
    }
  })();
  pending.set(address, flow);
  return flow;
}

/**
 * Appel authentifie. En mode interactif, une session absente ou expiree
 * est rejouee via le wallet (re-authentification transparente) ; sinon
 * l'appel renvoie null sans rien demander a l'utilisateur.
 */
async function withAuth<T>(
  address: string,
  interactive: boolean,
  run: (token: string) => Promise<T | null>
): Promise<T | null> {
  const cached = getSession(address);
  let token = cached;
  if (!token) {
    if (!interactive) return null;
    token = await authenticate(address);
    if (!token) return null;
  }
  const result = await run(token);
  if (result !== null || !interactive || !cached) return result;
  // Echec avec un token en cache (secret serveur change, token revoque) :
  // on rejoue une authentification fraiche, une seule fois. Si l'API est
  // simplement injoignable, la demande de defi echoue avant toute signature.
  sessions.delete(address);
  const fresh = await authenticate(address);
  if (!fresh) return null;
  return run(fresh);
}

// --- Endpoints ---

/** Historique on-chain d'une adresse (public, sans authentification). */
export async function walletHistory(wallet: string): Promise<ChainEvent[] | null> {
  const res = await request<{ events: ChainEvent[] }>(`/history/${wallet}`);
  return res?.events ?? null;
}

/**
 * Enregistre une demande de livraison aupres du backend (coordonnees
 * chiffrees au repos, seul le hash part on-chain). A appeler avant la
 * transaction : le hash renvoye doit correspondre au hash local.
 */
export function createClaim(
  address: string,
  vaultContract: string,
  lots: number,
  payload: string
): Promise<{ id: number; deliveryHashHex: string } | null> {
  return withAuth(address, true, (token) =>
    request("/claims", {
      method: "POST",
      token,
      body: JSON.stringify({ vaultContract, lots, payload }),
    })
  );
}

/** Demandes de livraison de l'adresse, si une session est deja ouverte. */
export function myClaims(address: string): Promise<ClaimRecord[] | null> {
  return withAuth(address, false, async (token) => {
    const res = await request<{ claims: ClaimRecord[] }>("/claims/mine", { token });
    return res?.claims ?? null;
  });
}

/** Depose une demande de reprise dans la file backend. */
export function createRepurchase(
  address: string,
  vaultContract: string,
  lots: number
): Promise<RepurchaseRecord | null> {
  return withAuth(address, true, (token) =>
    request("/repurchases", {
      method: "POST",
      token,
      body: JSON.stringify({ vaultContract, lots }),
    })
  );
}

/** Demandes de reprise de l'adresse, si une session est deja ouverte. */
export function myRepurchases(address: string): Promise<RepurchaseRecord[] | null> {
  return withAuth(address, false, async (token) => {
    const res = await request<{ requests: RepurchaseRecord[] }>("/repurchases/mine", {
      token,
    });
    return res?.requests ?? null;
  });
}

/** Statut de verification d'identite, si une session est deja ouverte. */
export function myKyc(address: string): Promise<KycInfo | null> {
  return withAuth(address, false, (token) =>
    request<KycInfo>("/kyc/mine", { token })
  );
}

export type KycSession = { token: string; level: string };

/**
 * Ouvre une session de verification d'identite (access token Sumsub lie a
 * l'adresse). "unavailable" signale un service non configure (503), a
 * distinguer d'une erreur passagere (null) qui merite un nouvel essai.
 */
export function kycSession(
  address: string
): Promise<KycSession | "unavailable" | null> {
  return withAuth<KycSession | "unavailable">(address, true, async (token) => {
    try {
      const res = await fetch(`${API_URL}/kyc/session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 503) return "unavailable";
      if (!res.ok) return null;
      return (await res.json()) as KycSession;
    } catch {
      return null;
    }
  });
}
