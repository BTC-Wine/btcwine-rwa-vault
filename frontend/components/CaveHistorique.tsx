"use client";

import { useEffect, useState } from "react";
import { walletHistory, type ChainEvent } from "@/lib/api";
import { BOTTLES_PER_TOKEN, STROOPS, config } from "@/lib/config";
import { isDemo } from "@/lib/demo";
import { useT } from "./I18nProvider";

// Historique personnel, lu depuis l'indexeur (endpoint public) : achats en
// primeur, transferts recus et envoyes, reprises, demandes de livraison,
// emissions de certificats. Un detenteur peut avoir tout recu par transfert
// sans jamais avoir achete ici : l'acquisition s'affiche alors sans cout
// d'entree. Sans backend joignable, la section n'apparait pas.

type RowKind = "deposit" | "transferIn" | "transferOut" | "redeem" | "claim" | "mint";

type Row = {
  key: string;
  kind: RowKind;
  vintage: string | null;
  bottles: number | null;
  amountUsdc: number | null;
  tx: string;
};

// vault ou token -> millesime, pour parler millesime plutot que contrat
function vintageOf(contractId: string): string | null {
  let i = config.vaultIds.indexOf(contractId);
  if (i < 0) i = config.tokenIds.indexOf(contractId);
  return i >= 0 ? config.vintages[i] : null;
}

// Les bigint et les Buffer arrivent serialises en chaines (JSON ne les
// porte pas) : on relit prudemment, null si le format surprend.
function asAmount(v: unknown): number | null {
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  if (typeof v === "number") return v;
  return null;
}

function decodeRow(e: ChainEvent, wallet: string, key: string): Row | null {
  const topics = Array.isArray(e.topics) ? e.topics : [];
  const data = e.data;
  const vintage = vintageOf(e.contract_id);

  switch (e.kind) {
    case "deposit": {
      const [lots, paid] = Array.isArray(data) ? data : [];
      const n = asAmount(lots);
      const p = asAmount(paid);
      return {
        key,
        kind: "deposit",
        vintage,
        bottles: n !== null ? n * BOTTLES_PER_TOKEN : null,
        amountUsdc: p !== null ? p / Number(STROOPS) : null,
        tx: e.tx,
      };
    }
    case "redeem": {
      const [lots, payout] = Array.isArray(data) ? data : [];
      const n = asAmount(lots);
      const p = asAmount(payout);
      return {
        key,
        kind: "redeem",
        vintage,
        bottles: n !== null ? n * BOTTLES_PER_TOKEN : null,
        amountUsdc: p !== null ? p / Number(STROOPS) : null,
        tx: e.tx,
      };
    }
    case "claim": {
      const [lots] = Array.isArray(data) ? data : [];
      const n = asAmount(lots);
      return {
        key,
        kind: "claim",
        vintage,
        bottles: n !== null ? n * BOTTLES_PER_TOKEN : null,
        amountUsdc: null,
        tx: e.tx,
      };
    }
    case "transfer": {
      // SAC : topics [from, to, actif], data = montant en stroops
      const [from, to] = topics.map(String);
      if (from !== wallet && to !== wallet) return null;
      const a = asAmount(data);
      const tokens = a !== null ? Math.floor(a / Number(STROOPS)) : null;
      return {
        key,
        kind: from === wallet ? "transferOut" : "transferIn",
        vintage,
        bottles: tokens !== null ? tokens * BOTTLES_PER_TOKEN : null,
        amountUsdc: null,
        tx: e.tx,
      };
    }
    case "mint": {
      // SAC : le wallet apparait en destinataire, data = montant en stroops
      if (!topics.map(String).includes(wallet)) return null;
      const a = asAmount(data);
      const tokens = a !== null ? Math.floor(a / Number(STROOPS)) : null;
      return {
        key,
        kind: "mint",
        vintage,
        bottles: tokens !== null ? tokens * BOTTLES_PER_TOKEN : null,
        amountUsdc: null,
        tx: e.tx,
      };
    }
    default:
      // evenements techniques (settled, extended, fulfilled...) : hors sujet ici
      return null;
  }
}

// Historique d'exemple pour l'apercu du mode demo : montre quand l'adresse
// n'a aucune operation indexee. Valeurs factices (achat, transfert recu,
// reprise, demande de livraison), signalees "apercu" dans l'UI et sans lien
// de transaction, rien de reel a pointer.
// Millesimes derives de la config, pour rester coherents avec la cave et le
// suivi quels que soient les millesimes deployes. Montant de reprise sous le
// prix d'achat : le payout est un prorata des fonds deposes, jamais garanti,
// on ne suggere pas un remboursement a l'identique.
const DEMO_V0 = config.vintages[0] ?? "2025";
const DEMO_V1 = config.vintages[1] ?? "2026";
const DEMO_HISTORY: Row[] = [
  { key: "demo-deposit", kind: "deposit", vintage: DEMO_V0, bottles: 15, amountUsdc: 1030, tx: "" },
  { key: "demo-transfer", kind: "transferIn", vintage: DEMO_V1, bottles: 6, amountUsdc: null, tx: "" },
  { key: "demo-redeem", kind: "redeem", vintage: DEMO_V0, bottles: 6, amountUsdc: 380, tx: "" },
  { key: "demo-claim", kind: "claim", vintage: DEMO_V0, bottles: 9, amountUsdc: null, tx: "" },
];

export function CaveHistorique({ address }: { address: string }) {
  const t = useT("cellar");
  const demo = isDemo();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    // L'historique passe par l'endpoint public /history (aucune signature).
    walletHistory(address).then((events) => {
      if (!events) {
        // En mode demo, l'absence d'indexeur bascule sur l'apercu d'exemple.
        // Hors demo, comportement historique inchange : la section reste masquee.
        if (demo) setRows([]);
        return;
      }
      setRows(
        events
          .map((e, i) => decodeRow(e, address, `${e.tx}-${i}`))
          .filter((r): r is Row => r !== null)
      );
    });
  }, [address, demo]);

  if (rows === null) return null;

  // Apercu : uniquement en demo et si aucune operation reelle a montrer.
  const sample = demo && rows.length === 0;
  const display = sample ? DEMO_HISTORY : rows;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-serif text-2xl text-[#5a1f2b]">{t("history.title")}</h2>
        {sample && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
            {t("demo.tag")}
          </span>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6">
        {display.length === 0 ? (
          <p className="text-sm text-stone-500">{t("history.empty")}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {display.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2 py-3">
                <div className="flex-1">
                  <p className="text-sm text-stone-800">{t(`history.rows.${r.kind}`)}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {r.bottles !== null &&
                      (r.vintage
                        ? t("history.detail", { n: r.bottles, vintage: r.vintage })
                        : t("history.detailNoVintage", { n: r.bottles }))}
                    {r.kind === "deposit" &&
                      r.amountUsdc !== null &&
                      ` · ${t("history.paid", {
                        amount: r.amountUsdc.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
                      })}`}
                    {r.kind === "redeem" &&
                      r.amountUsdc !== null &&
                      ` · ${t("history.received", {
                        amount: r.amountUsdc.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
                      })}`}
                    {r.kind === "transferIn" && ` · ${t("history.noEntryCost")}`}
                  </p>
                </div>
                {sample ? (
                  <span className="whitespace-nowrap text-xs text-stone-500">
                    {t("demo.rowTag")}
                  </span>
                ) : (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${r.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-xs text-[#5a1f2b] underline"
                  >
                    {t("history.viewTx")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-stone-500">{sample ? t("demo.note") : t("history.note")}</p>
      </div>
    </section>
  );
}
