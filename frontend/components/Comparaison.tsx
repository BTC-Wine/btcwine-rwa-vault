"use client";

import { htFromTTC, souscription2025 } from "@/lib/domaine";
import { useT } from "./I18nProvider";

// Comparaison factuelle et sourcee : meme vin, meme millesime, meme mecanisme
// (payer maintenant, livre apres elevage). Aucune promesse, deux prix publics.
export function Comparaison() {
  const t = useT("home");
  return (
    <section className="mt-16">
      <h3 className="font-serif text-3xl text-[#5a1f2b]">
        {t("comparison.title")}
      </h3>
      <p className="mt-1 text-sm text-stone-500">
        {t("comparison.intro")}
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-8">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-stone-500">
            {t("comparison.col1Label")}
          </p>
          <p className="mt-3 font-serif text-4xl text-stone-800">
            {souscription2025.prixTTC} €{" "}
            <span className="text-lg text-stone-500">{t("comparison.perBottleTTC")}</span>
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {t("comparison.approxHT", { price: htFromTTC(souscription2025.prixTTC) })}
          </p>
          <ul className="mt-5 space-y-2 text-sm text-stone-600">
            <li>{t("comparison.vintageOnly")}</li>
            <li>{t("comparison.delivery", { when: souscription2025.livraison })}</li>
            <li>{t("comparison.storageOwn")}</li>
          </ul>
          <p className="mt-5 text-xs text-stone-500">
            {t("comparison.observedOn", {
              distributor: souscription2025.distributeur,
              date: souscription2025.date,
            })}{" "}
            <a
              href={souscription2025.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#5a1f2b]"
            >
              {t("comparison.verify")}
            </a>
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[#5a1f2b] bg-white p-8">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#5a1f2b]">
            {t("comparison.col2Label")}
          </p>
          <p className="mt-3 font-serif text-4xl text-[#5a1f2b]">
            60,33 € <span className="text-lg text-stone-500">{t("comparison.perBottleHT")}</span>
          </p>
          <ul className="mt-5 space-y-2 text-sm text-stone-600">
            <li>{t("comparison.feat1")}</li>
            <li>{t("comparison.feat2")}</li>
            <li>{t("comparison.feat3")}</li>
            <li>{t("comparison.feat4")}</li>
          </ul>
          <p className="mt-5 text-xs text-stone-500">
            {t("comparison.footnote")}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-stone-500">
        {t("comparison.note")}
      </p>
    </section>
  );
}
