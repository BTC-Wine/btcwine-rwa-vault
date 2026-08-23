"use client";

import { useEffect, useState } from "react";
import {
  createClaim,
  createRepurchase,
  getSession,
  myClaims,
  type ClaimRecord,
} from "@/lib/api";
import { STROOPS, config } from "@/lib/config";
import { isDemo } from "@/lib/demo";
import { postForm, randomNonce } from "@/lib/forms";
import {
  buildClaimTx,
  buildRedeemTx,
  previewRedeem,
  readClaim,
  readVaultState,
  sha256Hex,
  submitSigned,
  type ClaimData,
} from "@/lib/soroban";
import { signTx } from "@/lib/wallet";
import { useT } from "./I18nProvider";

// Panneau de gestion d'un millesime disponible : trois chemins de sortie en
// cartes (livraison, reprise producteur, mise en vente). Tout ce qui est
// on-chain est reel ; la mise en vente est un service annonce, a venir.
export function VintagePanel({
  vaultIndex,
  vintage,
  tokens,
  bottles,
  address,
}: {
  vaultIndex: number;
  vintage: string;
  tokens: number;
  bottles: number;
  address: string;
}) {
  const t = useT("cellar");
  const vaultId = config.vaultIds[vaultIndex];
  const demo = isDemo();
  const [state, setState] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimData>(null);
  const [suivi, setSuivi] = useState<ClaimRecord | null>(null);
  const [modal, setModal] = useState<"redeem" | "deliver" | "sell" | "request" | null>(null);
  const [done, setDone] = useState<"redeem" | "deliver" | null>(null);

  useEffect(() => {
    if (demo) {
      setState("Settled");
      return;
    }
    readVaultState(vaultId).then(setState).catch(() => {});
    readClaim(vaultId, address).then(setClaim).catch(() => {});
  }, [vaultId, address, demo]);

  // Suivi backend de la demande de livraison, seulement si une session
  // est deja ouverte : jamais de signature spontanee pour de l'affichage.
  useEffect(() => {
    if (demo || !getSession(address)) return;
    myClaims(address).then((claims) => {
      const c = claims?.find((x) => x.vault_contract === vaultId);
      if (c) setSuivi(c);
    });
  }, [vaultId, address, demo, done]);

  const claimPending = claim !== null && !claim.fulfilled;
  const settled = state === "Settled";

  if (done === "redeem") {
    return (
      <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
        {t("actions.redeemSuccess")}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <p className="text-sm font-medium text-stone-700">{t("actions.panelQuestion")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {/* livraison */}
        <div className="flex flex-col rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-serif text-lg text-[#5a1f2b]">{t("actions.deliver")}</p>
          <p className="mt-1 flex-1 text-xs text-stone-500">{t("actions.deliverDesc")}</p>
          {done === "deliver" || claimPending ? (
            <div className="mt-3 text-xs text-green-800">
              <p>
                {done === "deliver"
                  ? t("actions.deliverSuccess")
                  : t("actions.claimPending", {
                      date: new Date(Number(claim?.timestamp ?? 0) * 1000).toLocaleDateString("fr-FR"),
                    })}
              </p>
              {suivi && (
                <p className="mt-1 text-stone-500">
                  {t("actions.claimTracking", {
                    status: t(`actions.claimStatus.${suivi.status}`),
                  })}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setModal("deliver")}
              className="mt-3 min-h-10 rounded-lg bg-[#5a1f2b] px-3 py-2 text-xs text-white hover:bg-[#71303e]"
            >
              {t("actions.deliverCta")}
            </button>
          )}
        </div>

        {/* reprise producteur : sur demande, reglee par le chateau */}
        <div className="flex flex-col rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-serif text-lg text-[#5a1f2b]">{t("actions.redeem")}</p>
          <p className="mt-1 flex-1 text-xs text-stone-500">{t("actions.redeemDesc")}</p>
          {settled ? (
            <button
              onClick={() => setModal("redeem")}
              className="mt-3 min-h-10 rounded-lg border border-[#5a1f2b] px-3 py-2 text-xs text-[#5a1f2b] hover:bg-[#5a1f2b] hover:text-white"
            >
              {t("actions.redeemCta")}
            </button>
          ) : (
            <button
              onClick={() => setModal("request")}
              className="mt-3 min-h-10 rounded-lg border border-[#5a1f2b] px-3 py-2 text-xs text-[#5a1f2b] hover:bg-[#5a1f2b] hover:text-white"
            >
              {t("actions.requestCta")}
            </button>
          )}
        </div>

        {/* mise en vente (service a venir) */}
        <div className="flex flex-col rounded-xl border border-dashed border-stone-300 bg-white/60 p-4">
          <p className="font-serif text-lg text-stone-700">
            {t("actions.sellTitle")}
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 align-middle text-[10px] font-medium text-stone-500">
              {t("actions.sellSoonBadge")}
            </span>
          </p>
          <p className="mt-1 flex-1 text-xs text-stone-500">{t("actions.sellDesc")}</p>
          <button
            onClick={() => setModal("sell")}
            className="mt-3 min-h-10 rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-600 hover:border-[#5a1f2b] hover:text-[#5a1f2b]"
          >
            {t("actions.sellCta")}
          </button>
        </div>
      </div>

      {modal === "redeem" && (
        <RedeemModal
          vaultId={vaultId}
          vintage={vintage}
          tokens={tokens}
          bottles={bottles}
          address={address}
          demo={demo}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setDone("redeem");
          }}
        />
      )}
      {modal === "deliver" && (
        <DeliverModal
          vaultId={vaultId}
          vintage={vintage}
          tokens={tokens}
          bottles={bottles}
          address={address}
          demo={demo}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setDone("deliver");
          }}
        />
      )}
      {modal === "sell" && <SellModal onClose={() => setModal(null)} />}
      {modal === "request" && (
        <RequestModal
          vaultId={vaultId}
          vintage={vintage}
          tokens={tokens}
          bottles={bottles}
          address={address}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function RequestModal({
  vaultId,
  vintage,
  tokens,
  bottles,
  address,
  onClose,
}: {
  vaultId: string;
  vintage: string;
  tokens: number;
  bottles: number;
  address: string;
  onClose: () => void;
}) {
  const t = useT("cellar");
  // La demande part par defaut dans la file backend, signee avec le wallet ;
  // si la signature est refusee ou l'API injoignable, submit() bascule sur la
  // collecte email historique. Pas de pre-sonde /health : les bloqueurs la
  // filtrent souvent et forceraient l'email a tort.
  const [mode, setMode] = useState<"backend" | "email">("backend");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<"backend" | "email" | null>(null);
  const [failed, setFailed] = useState(false);

  const mailto = `mailto:contact@terwa.io?subject=${encodeURIComponent(
    `Demande de reprise - millesime ${vintage}`
  )}&body=${encodeURIComponent(
    `Millesime : ${vintage}\nBouteilles : ${bottles}\nWallet : ${address}\nEmail : ${email}`
  )}`;

  async function submit() {
    setBusy(true);
    setFailed(false);
    if (mode === "backend") {
      const req = await createRepurchase(address, vaultId, tokens);
      if (req) {
        setSent("backend");
        setBusy(false);
        return;
      }
      // Signature refusee ou API tombee entre-temps : bascule vers l'email
      setMode("email");
      setBusy(false);
      return;
    }
    try {
      await postForm("repurchase-request", {
        vintage,
        bottles: String(bottles),
        wallet: address,
        email,
      });
      setSent("email");
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <Modal onClose={onClose}>
        <h3 className="font-serif text-xl text-[#5a1f2b]">{t("actions.requestTitle")}</h3>
        <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {sent === "backend" ? t("actions.requestQueued") : t("actions.requestSent")}
        </p>
        <button
          onClick={onClose}
          className="mt-5 min-h-11 w-full rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e]"
        >
          {t("actions.modalClose")}
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-serif text-xl text-[#5a1f2b]">{t("actions.requestTitle")}</h3>
      <p className="mt-2 text-sm text-stone-600">{t("actions.requestBody")}</p>
      {mode === "email" && (
        <label className="mt-4 block text-xs text-stone-500">
          {t("actions.requestEmail")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-[#5a1f2b] focus:outline-none"
          />
        </label>
      )}
      <p className="mt-3 text-xs text-stone-500">
        {mode === "backend" ? t("actions.requestQueueNote") : t("actions.requestNote")}
      </p>
      {failed && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {t("actions.sendFailed")}{" "}
          <a href={mailto} className="underline">
            {t("actions.sendByEmail")}
          </a>
        </div>
      )}
      <div className="mt-5 flex gap-3">
        <button
          onClick={onClose}
          className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 py-2 text-stone-700"
        >
          {t("actions.modalClose")}
        </button>
        <button
          onClick={submit}
          disabled={busy || (mode === "email" && !email.includes("@"))}
          className="min-h-11 flex-1 rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e] disabled:opacity-40"
        >
          {busy ? t("actions.processing") : t("actions.requestSend")}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SellModal({ onClose }: { onClose: () => void }) {
  const t = useT("cellar");
  return (
    <Modal onClose={onClose}>
      <h3 className="font-serif text-xl text-[#5a1f2b]">{t("actions.sellTitle")}</h3>
      <p className="mt-2 text-sm text-stone-600">{t("actions.sellModalBody")}</p>
      <p className="mt-3 text-xs text-stone-500">{t("actions.sellModalNote")}</p>
      <button
        onClick={onClose}
        className="mt-5 min-h-11 w-full rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e]"
      >
        {t("actions.sellModalOk")}
      </button>
    </Modal>
  );
}

function RedeemModal({
  vaultId,
  vintage,
  tokens,
  bottles,
  address,
  demo,
  onClose,
  onDone,
}: {
  vaultId: string;
  vintage: string;
  tokens: number;
  bottles: number;
  address: string;
  demo: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("cellar");
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) {
      setAmount(tokens * 206);
      return;
    }
    previewRedeem(vaultId, address, tokens)
      .then((v) => setAmount(Number(v) / Number(STROOPS)))
      .catch(() => setError(t("error")));
  }, [vaultId, address, tokens, demo, t]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 1200));
      } else {
        const tx = await buildRedeemTx(vaultId, address, tokens);
        const signed = await signTx(tx.toXDR(), address);
        await submitSigned(signed);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-serif text-xl text-[#5a1f2b]">{t("actions.redeemTitle")}</h3>
      <p className="mt-2 text-sm text-stone-600">
        {t("actions.redeemBody", { bottles, vintage })}
      </p>
      <p className="mt-4 rounded-lg bg-stone-50 px-4 py-3 text-center font-serif text-2xl text-[#5a1f2b]">
        {amount === null
          ? t("actions.simulating")
          : t("actions.redeemAmount", {
              amount: amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
            })}
        {demo && amount !== null && (
          <span className="block text-xs text-stone-400">{t("actions.demoNote")}</span>
        )}
      </p>
      <p className="mt-3 text-xs text-stone-500">{t("actions.redeemIrreversible")}</p>
      {error && <p className="mt-3 text-sm text-red-800">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button
          onClick={onClose}
          className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 py-2 text-stone-700"
        >
          {t("actions.modalClose")}
        </button>
        <button
          onClick={confirm}
          disabled={busy || amount === null}
          className="min-h-11 flex-1 rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e] disabled:opacity-40"
        >
          {busy ? t("actions.processing") : t("actions.redeemConfirm")}
        </button>
      </div>
    </Modal>
  );
}

function DeliverModal({
  vaultId,
  vintage,
  tokens,
  bottles,
  address,
  demo,
  onClose,
  onDone,
}: {
  vaultId: string;
  vintage: string;
  tokens: number;
  bottles: number;
  address: string;
  demo: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT("cellar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendFailed, setSendFailed] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    postal: "",
    city: "",
    country: "",
    email: "",
    phone: "",
  });

  const valid = form.name && form.address && form.city && form.country && form.email;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 1200));
        onDone();
        return;
      }
      // Le nonce rend l'empreinte on-chain impossible a tester par
      // dictionnaire ; les coordonnees en clair ne quittent le navigateur
      // que vers notre collecte privee, jamais vers la chaine.
      const nonce = randomNonce();
      const payload = JSON.stringify({ ...form, wallet: address, vintage, tokens, nonce });
      const hash = await sha256Hex(payload);
      // Enregistrement backend avant la transaction : la meme chaine JSON
      // que celle hachee localement part au serveur, qui la chiffre au repos
      // et renvoie son propre hash. En cas d'ecart (ne devrait jamais
      // arriver), le hash local fait foi : c'est lui qui part on-chain.
      const backendClaim = await createClaim(address, vaultId, tokens, payload);
      if (backendClaim && backendClaim.deliveryHashHex !== hash) {
        console.warn("hash backend different du hash local, hash local conserve");
      }
      const tx = await buildClaimTx(vaultId, address, tokens, hash);
      const signed = await signTx(tx.toXDR(), address);
      await submitSigned(signed);
      if (!backendClaim) {
        // API injoignable : collecte historique des coordonnees, inchangee
        try {
          await postForm("delivery-request", {
            ...form,
            vintage,
            tokens: String(tokens),
            bottles: String(bottles),
            wallet: address,
            hash,
            nonce,
          });
        } catch {
          // La demande est actee on-chain : on propose un envoi manuel des
          // coordonnees plutot que de bloquer.
          setSendFailed(
            `mailto:contact@terwa.io?subject=${encodeURIComponent(
              `Livraison - millesime ${vintage}`
            )}&body=${encodeURIComponent(
              `Millesime : ${vintage}\nBouteilles : ${bottles}\nWallet : ${address}\nNonce : ${nonce}\n\nNom : ${form.name}\nAdresse : ${form.address}\n${form.postal} ${form.city}, ${form.country}\nEmail : ${form.email}\nTelephone : ${form.phone}`
            )}`
          );
          setBusy(false);
          return;
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setBusy(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: "name", label: t("actions.fieldName") },
    { key: "address", label: t("actions.fieldAddress") },
    { key: "postal", label: t("actions.fieldPostal") },
    { key: "city", label: t("actions.fieldCity") },
    { key: "country", label: t("actions.fieldCountry") },
    { key: "email", label: t("actions.fieldEmail"), type: "email" },
    { key: "phone", label: t("actions.fieldPhone"), type: "tel" },
  ];

  return (
    <Modal onClose={onClose}>
      <h3 className="font-serif text-xl text-[#5a1f2b]">{t("actions.deliverTitle")}</h3>
      <p className="mt-2 text-sm text-stone-600">
        {t("actions.deliverBody", { bottles, vintage })}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <label
            key={f.key}
            className={`text-xs text-stone-500 ${
              f.key === "name" || f.key === "address" || f.key === "email" ? "col-span-2" : ""
            }`}
          >
            {f.label}
            <input
              type={f.type ?? "text"}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-[#5a1f2b] focus:outline-none"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-stone-500">{t("actions.deliverPrivacy")}</p>
      {error && <p className="mt-3 text-sm text-red-800">{error}</p>}
      {sendFailed && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {t("actions.sendFailed")}{" "}
          <a href={sendFailed} className="underline">
            {t("actions.sendByEmail")}
          </a>
        </div>
      )}
      <div className="mt-5 flex gap-3">
        <button
          onClick={sendFailed ? onDone : onClose}
          className="min-h-11 flex-1 rounded-xl border border-stone-300 px-4 py-2 text-stone-700"
        >
          {t("actions.modalClose")}
        </button>
        {!sendFailed && (
          <button
            onClick={confirm}
            disabled={busy || !valid}
            className="min-h-11 flex-1 rounded-xl bg-[#5a1f2b] px-4 py-2 text-white hover:bg-[#71303e] disabled:opacity-40"
          >
            {busy ? t("actions.processing") : t("actions.deliverConfirm")}
          </button>
        )}
      </div>
    </Modal>
  );
}
