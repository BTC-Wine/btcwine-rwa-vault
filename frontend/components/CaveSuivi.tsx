"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  authenticate,
  getSession,
  kycSession,
  myKyc,
  myRepurchases,
  type KycInfo,
  type KycSession,
  type RepurchaseRecord,
} from "@/lib/api";
import { BOTTLES_PER_TOKEN, config } from "@/lib/config";
import { DEMO_KYC, DEMO_REPURCHASES, isDemo } from "@/lib/demo";
import { useLocale, useT } from "./I18nProvider";

// Suivi personnel dans Ma cave : demandes de reprise en file backend.
// L'acces demande une preuve de controle de l'adresse (SEP-10), signee une
// fois par session. La section s'affiche toujours (des qu'un wallet est
// connecte) : pas de pre-sonde /health, que les bloqueurs (Brave, uBlock)
// filtrent souvent ; si le backend est injoignable, c'est le deverrouillage
// qui echoue proprement, avec un message.
export function CaveSuivi({ address }: { address: string }) {
  const t = useT("cellar");
  const demo = isDemo();
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);
  const [requests, setRequests] = useState<RepurchaseRecord[] | null>(null);
  const [kyc, setKyc] = useState<KycInfo | null>(null);

  const load = useCallback(async () => {
    const [reqs, status] = await Promise.all([myRepurchases(address), myKyc(address)]);
    setRequests(reqs);
    setKyc(status);
  }, [address]);

  // Session deja ouverte (par exemple apres une demande signee) : on
  // charge sans rien demander a l'utilisateur.
  useEffect(() => {
    if (demo) return;
    if (getSession(address)) {
      setAuthed(true);
      load();
    }
  }, [demo, address, load]);

  async function unlock() {
    setBusy(true);
    setUnlockFailed(false);
    const token = await authenticate(address);
    if (token) {
      setAuthed(true);
      await load();
    } else {
      setUnlockFailed(true);
    }
    setBusy(false);
  }

  // Mode demo (pas de wallet a faire signer) : apercu a partir de donnees
  // d'exemple locales, sans aucune signature ni appel authentifie. Le vrai
  // chemin (unlock -> authenticate -> load) reste hors demo, inchange.
  if (demo) return <CaveSuiviDemo />;

  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-[#5a1f2b]">{t("tracking.title")}</h2>

      {!authed ? (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-sm text-stone-600">{t("tracking.unlock.body")}</p>
          <button
            onClick={unlock}
            disabled={busy}
            className="mt-4 min-h-11 rounded-xl border border-[#5a1f2b] px-5 py-2 text-sm text-[#5a1f2b] hover:bg-[#5a1f2b] hover:text-white disabled:opacity-40"
          >
            {busy ? t("tracking.unlock.busy") : t("tracking.unlock.cta")}
          </button>
          {unlockFailed && (
            <p className="mt-3 text-sm text-red-800">{t("tracking.kyc.failed")}</p>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <KycCard kyc={kyc} address={address} onChanged={load} />
          <RepriseSuivi requests={requests} />
        </div>
      )}
    </section>
  );
}

// Apercu du suivi en mode demo : memes cartes que l'espace connecte, mais
// nourries de donnees d'exemple (lib/demo.ts). Aucun appel authentifie, aucun
// parcours Sumsub : ce bloc ne reference ni myKyc, ni myRepurchases, ni
// kycSession. Une mention "apercu" signale que rien n'est reel.
function CaveSuiviDemo() {
  const t = useT("cellar");
  // millesime reel pour chaque demande d'exemple, pour parler millesime
  const requests: RepurchaseRecord[] = DEMO_REPURCHASES.map((r) => ({
    id: r.id,
    lots: r.lots,
    status: r.status,
    requested_at: r.requested_at,
    vault_contract: config.vaultIds[r.vintageIndex] ?? "",
  }));

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-serif text-2xl text-[#5a1f2b]">{t("tracking.title")}</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
          {t("demo.tag")}
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-500">{t("demo.note")}</p>
      <div className="mt-4 grid gap-4">
        <KycCardDemo />
        <RepriseSuivi requests={requests} sample />
      </div>
    </section>
  );
}

// Carte de verification en apercu : statut d'exemple, pas de bouton actif vers
// Sumsub. Le "Commencer la verification" est presente desactive, avec une
// note d'apercu ; le vrai parcours ne s'ouvre que sur l'espace connecte.
function KycCardDemo() {
  const t = useT("cellar");
  const status = DEMO_KYC.status;
  const badge =
    status === "approved"
      ? "bg-green-50 text-green-800"
      : status === "pending"
      ? "bg-amber-50 text-amber-800"
      : status === "rejected"
      ? "bg-red-50 text-red-800"
      : "bg-stone-100 text-stone-600";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-serif text-lg text-[#5a1f2b]">{t("tracking.kyc.title")}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}>
          {t(`tracking.kyc.status.${status}`)}
        </span>
      </div>
      <p className="mt-2 text-sm text-stone-600">{t(`tracking.kyc.body.${status}`)}</p>
      {status === "none" && (
        <>
          <button
            disabled
            className="mt-4 min-h-11 cursor-not-allowed rounded-xl border border-stone-200 px-5 py-2 text-sm text-stone-400"
          >
            {t("tracking.kyc.startCta")}
          </button>
          <p className="mt-2 text-xs text-stone-500">{t("demo.kycHint")}</p>
        </>
      )}
      {status === "approved" && (
        <p className="mt-2 text-xs text-stone-500">
          {DEMO_KYC.allowlisted
            ? t("tracking.kyc.allowlisted")
            : t("tracking.kyc.allowlistPending")}
        </p>
      )}
    </div>
  );
}

// Verification d'identite : demandee a la sortie seulement (reprise et
// livraison), jamais a l'achat. Le parcours Sumsub s'ouvre dans une modale ;
// une fois le dossier transmis, la carte passe en "examen" et le statut reel
// arrive par le webhook (recharge a la fermeture de la modale).
function KycCard({
  kyc,
  address,
  onChanged,
}: {
  kyc: KycInfo | null;
  address: string;
  onChanged: () => void;
}) {
  const t = useT("cellar");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"unavailable" | "failed" | null>(null);
  const [session, setSession] = useState<KycSession | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Un dossier vient de partir mais le webhook n'est pas encore revenu :
  // l'examen est bien en cours cote Sumsub, la carte le dit.
  const status = kyc?.status ?? "none";
  const shown = submitted && status === "none" ? "pending" : status;

  async function start() {
    setBusy(true);
    setNotice(null);
    const s = await kycSession(address);
    if (s === "unavailable") setNotice("unavailable");
    else if (!s) setNotice("failed");
    else setSession(s);
    setBusy(false);
  }

  const badge =
    shown === "approved"
      ? "bg-green-50 text-green-800"
      : shown === "pending"
      ? "bg-amber-50 text-amber-800"
      : shown === "rejected"
      ? "bg-red-50 text-red-800"
      : "bg-stone-100 text-stone-600";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-serif text-lg text-[#5a1f2b]">{t("tracking.kyc.title")}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}>
          {t(`tracking.kyc.status.${shown}`)}
        </span>
      </div>
      <p className="mt-2 text-sm text-stone-600">{t(`tracking.kyc.body.${shown}`)}</p>
      {shown === "none" && notice !== "unavailable" && (
        <button
          onClick={start}
          disabled={busy}
          className="mt-4 min-h-11 rounded-xl border border-[#5a1f2b] px-5 py-2 text-sm text-[#5a1f2b] hover:bg-[#5a1f2b] hover:text-white disabled:opacity-40"
        >
          {busy ? t("tracking.kyc.startBusy") : t("tracking.kyc.startCta")}
        </button>
      )}
      {notice === "unavailable" && (
        <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">
          {t("tracking.kyc.unavailable")}
        </p>
      )}
      {notice === "failed" && (
        <p className="mt-3 text-sm text-red-800">{t("tracking.kyc.failed")}</p>
      )}
      {shown === "approved" && (
        <p className="mt-2 text-xs text-stone-500">
          {kyc?.allowlisted
            ? t("tracking.kyc.allowlisted")
            : t("tracking.kyc.allowlistPending")}
        </p>
      )}
      {session && (
        <VerificationModal
          address={address}
          session={session}
          onSubmitted={() => {
            setSubmitted(true);
            onChanged();
          }}
          onClose={() => {
            setSession(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// Modale du parcours Sumsub : le WebSDK se monte dans un conteneur dedie et
// rappelle le backend pour un token frais a l'expiration. La fermeture rend
// la main sans perdre le dossier (reprise possible au meme endroit).
function VerificationModal({
  address,
  session,
  onSubmitted,
  onClose,
}: {
  address: string;
  session: KycSession;
  onSubmitted: () => void;
  onClose: () => void;
}) {
  const t = useT("cellar");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let sdk: { destroy: () => void } | null = null;
    (async () => {
      try {
        const { default: snsWebSdk } = await import("@sumsub/websdk");
        if (cancelled || !containerRef.current) return;
        const instance = snsWebSdk
          .init(session.token, async () => {
            // Token expire : le backend signe une session fraiche
            const fresh = await kycSession(address);
            if (!fresh || fresh === "unavailable") {
              throw new Error("kyc session refresh failed");
            }
            return fresh.token;
          })
          .withConf({ lang: locale })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .on("idCheck.onApplicantSubmitted", () => onSubmitted())
          .on("idCheck.onApplicantStatusChanged", (payload) => {
            // "init" = dossier pas encore transmis ; tout le reste signifie
            // qu'un examen est en cours ou termine
            if (payload.reviewStatus && payload.reviewStatus !== "init") onSubmitted();
          })
          .on("idCheck.onError", () => setFailed(true))
          .build();
        instance.launch(containerRef.current);
        sdk = instance;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      sdk?.destroy();
    };
    // les callbacks viennent du parent et restent stables sur la duree de la
    // modale ; seul un changement de token ou de langue remonte le SDK
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, locale, address]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-xl text-[#5a1f2b]">{t("tracking.kyc.title")}</h3>
          <button
            onClick={onClose}
            aria-label={t("actions.close")}
            title={t("actions.close")}
            className="-mr-1 rounded-lg px-2 text-2xl leading-none text-stone-400 hover:text-[#5a1f2b]"
          >
            &times;
          </button>
        </div>
        {failed ? (
          <div className="mt-4">
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {t("tracking.kyc.sdkError")}
            </p>
            <button
              onClick={onClose}
              className="mt-4 min-h-11 w-full rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e]"
            >
              {t("actions.close")}
            </button>
          </div>
        ) : (
          <div ref={containerRef} className="mt-4 min-h-[420px]" />
        )}
      </div>
    </div>
  );
}

const REPRISE_BADGES: Record<RepurchaseRecord["status"], string> = {
  requested: "bg-stone-100 text-stone-700",
  notified: "bg-amber-50 text-amber-800",
  funded: "bg-green-50 text-green-800",
  redeemed: "bg-green-50 text-green-800",
  cancelled: "bg-stone-100 text-stone-500",
};

function RepriseSuivi({
  requests,
  sample = false,
}: {
  requests: RepurchaseRecord[] | null;
  sample?: boolean;
}) {
  const t = useT("cellar");
  // vault -> millesime, pour parler millesime et bouteilles, jamais contrat
  const vintageOf = (contract: string) => {
    const i = config.vaultIds.indexOf(contract);
    return i >= 0 ? config.vintages[i] : null;
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <p className="font-serif text-lg text-[#5a1f2b]">{t("tracking.repurchases.title")}</p>
      {requests === null ? (
        <p className="mt-2 text-sm text-stone-500">...</p>
      ) : requests.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">{t("tracking.repurchases.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {requests.map((r) => {
            const vintage = vintageOf(r.vault_contract);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="flex-1">
                  <p className="text-sm text-stone-800">
                    {vintage
                      ? t("tracking.repurchases.row", {
                          bottles: r.lots * BOTTLES_PER_TOKEN,
                          vintage,
                        })
                      : t("tracking.repurchases.rowUnknown", {
                          bottles: r.lots * BOTTLES_PER_TOKEN,
                        })}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {t("tracking.repurchases.requestedOn", {
                      date: new Date(r.requested_at).toLocaleDateString("fr-FR"),
                    })}
                    {sample && ` · ${t("demo.rowTag")}`}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${REPRISE_BADGES[r.status] ?? "bg-stone-100 text-stone-700"}`}
                >
                  {t(`tracking.repurchases.status.${r.status}`)}
                </span>
                {r.status === "funded" && (
                  <p className="w-full text-xs text-green-800">
                    {t("tracking.repurchases.fundedHint")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-stone-500">{t("tracking.repurchases.note")}</p>
    </div>
  );
}
