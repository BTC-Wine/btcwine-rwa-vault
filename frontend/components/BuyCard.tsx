"use client";

import { useEffect, useState } from "react";
import { TOKENS_PER_ALLOCATION, BOTTLES_PER_TOKEN, STROOPS, config } from "@/lib/config";
import { isDemo } from "@/lib/demo";
import { htFromTTC, prixActuels, souscription2025 } from "@/lib/domaine";
import { PAYMENT_ASSETS, quoteSwap, swapToUsdc, type PaymentAsset } from "@/lib/paiement";
import { buildBuyTx, submitSigned, type VaultOverview } from "@/lib/soroban";
import { ensureTrustlines } from "@/lib/trustlines";
import { signTx } from "@/lib/wallet";
import { useT } from "./I18nProvider";
import { useWallet } from "./WalletProvider";

type Step = "idle" | "trustlines" | "swap" | "signing" | "sending" | "done" | "error";

export function BuyCard({ overview }: { overview: VaultOverview }) {
  const t = useT("buy");
  const { address, connect } = useWallet();
  const [allocations, setAllocations] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [payAsset, setPayAsset] = useState<PaymentAsset>(PAYMENT_ASSETS[0]);
  const [estimate, setEstimate] = useState<number | null>(null);

  const priceUsdc = Number(overview.unitPrice / STROOPS) * TOKENS_PER_ALLOCATION;
  const total = priceUsdc * allocations;
  const bottles = allocations * TOKENS_PER_ALLOCATION * BOTTLES_PER_TOKEN;
  const open = overview.state === "Presale";

  // estimation du cout dans l'actif choisi, au taux du DEX
  useEffect(() => {
    if (payAsset.direct) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimate(null);
    quoteSwap(payAsset, total)
      .then((q) => !cancelled && setEstimate(q.sourceAmount))
      .catch(() => !cancelled && setEstimate(null));
    return () => {
      cancelled = true;
    };
  }, [payAsset, total]);

  async function buy() {
    if (!address) return connect();
    setMessage("");
    if (isDemo()) {
      // mode demo temporaire : on simule la sequence sans transaction
      setStep("trustlines");
      await new Promise((r) => setTimeout(r, 700));
      if (!payAsset.direct) {
        setStep("swap");
        await new Promise((r) => setTimeout(r, 900));
      }
      setStep("signing");
      await new Promise((r) => setTimeout(r, 900));
      setStep("sending");
      await new Promise((r) => setTimeout(r, 1200));
      setTxHash("demo");
      setStep("done");
      return;
    }
    try {
      setStep("trustlines");
      const added = await ensureTrustlines(address);
      if (added) setMessage(t("status.trustlinesCreated"));

      if (!payAsset.direct) {
        // conversion dans le wallet de l'acheteur, via le DEX natif :
        // TERWA ne recoit que du stablecoin
        setStep("swap");
        await swapToUsdc(address, payAsset, total);
      }

      setStep("signing");
      const tx = await buildBuyTx(address, allocations, overview.attestation);
      const signed = await signTx(tx.toXDR(), address);

      setStep("sending");
      const hash = await submitSigned(signed);
      setTxHash(hash);
      setStep("done");
    } catch (e) {
      setStep("error");
      setMessage(e instanceof Error ? e.message : t("status.genericError"));
    }
  }

  if (!open) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-stone-600">
        {t("closed")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
      <h3 className="font-serif text-xl text-[#5a1f2b]">{t("heading")}</h3>
      <p className="mt-1 text-sm text-stone-500">
        {t("subtitle", {
          vintages: config.vintages.length,
          bottles: TOKENS_PER_ALLOCATION * BOTTLES_PER_TOKEN,
        })}
      </p>

      <div className="mt-6 flex items-center gap-4">
        <label htmlFor="qty" className="text-sm text-stone-700">
          {t("allocationsLabel")}
        </label>
        <div className="flex items-center rounded-lg border border-stone-300">
          <button
            className="px-3 py-1.5 text-stone-500 hover:text-[#5a1f2b]"
            onClick={() => setAllocations(Math.max(1, allocations - 1))}
            aria-label={t("decrease")}
          >
            &minus;
          </button>
          <span id="qty" className="w-10 text-center font-medium">
            {allocations}
          </span>
          <button
            className="px-3 py-1.5 text-stone-500 hover:text-[#5a1f2b]"
            onClick={() => setAllocations(allocations + 1)}
            aria-label={t("increase")}
          >
            +
          </button>
        </div>
      </div>

      <dl className="mt-6 space-y-1 border-t border-stone-100 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">{t("bottles")}</dt>
          <dd>{bottles} x 75 cl</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">{t("total")}</dt>
          <dd className="font-medium">{total.toLocaleString("fr-FR")} USDC</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-stone-500">{t("payWith")}</span>
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-xs">
          {PAYMENT_ASSETS.map((a) => (
            <button
              key={a.code}
              onClick={() => setPayAsset(a)}
              aria-pressed={payAsset.code === a.code}
              className={`px-3 py-1.5 ${
                payAsset.code === a.code
                  ? "bg-[#5a1f2b] text-white"
                  : "bg-white text-stone-600 hover:text-[#5a1f2b]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {!payAsset.direct && (
        <p className="mt-2 text-xs text-stone-500">
          {estimate !== null
            ? t("estimate", {
                amount: estimate.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
                asset: payAsset.label,
              })
            : t("quoting")}
        </p>
      )}
      <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
        {t("reference", {
          ttc: souscription2025.prixTTC,
          ht: htFromTTC(souscription2025.prixTTC),
          pct: Math.round((souscription2025.prixTTC / 1.19 / prixActuels.precommande - 1) * 100),
        })}
      </p>

      <label className="mt-6 flex items-start gap-3 text-sm text-stone-600">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          {t("attestationBefore")}
          <a href="/attestation-v1.md" target="_blank" className="underline hover:text-[#5a1f2b]">
            {t("attestationLink")}
          </a>
          {t("attestationAfter")}
        </span>
      </label>

      <button
        onClick={buy}
        disabled={
          !accepted ||
          step === "trustlines" ||
          step === "swap" ||
          step === "signing" ||
          step === "sending"
        }
        className="mt-6 w-full rounded-xl bg-[#5a1f2b] py-3 text-white hover:bg-[#71303e] disabled:opacity-40"
      >
        {!address
          ? t("cta.connect")
          : step === "trustlines"
          ? t("cta.preparing")
          : step === "swap"
          ? t("cta.converting")
          : step === "signing"
          ? t("cta.signing")
          : step === "sending"
          ? t("cta.sending")
          : t("cta.default")}
      </button>

      {step === "done" && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {t("status.done")}{" "}
          {txHash === "demo" ? (
            <span className="text-green-700">{t("status.demoNote")}</span>
          ) : (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              className="underline"
            >
              {t("status.viewTx")}
            </a>
          )}
        </p>
      )}
      {step === "error" && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>
      )}
    </div>
  );
}
