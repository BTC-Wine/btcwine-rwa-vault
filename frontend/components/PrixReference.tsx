"use client";

import Image from "next/image";
import { distributeurs, historique, htFromTTC, souscription2025 } from "@/lib/domaine";
import { useT } from "./I18nProvider";
import { LocaleLink } from "./LocaleLink";
import { CountryPriceBars, PriceStats } from "./PriceCharts";

export function PrixReference() {
  const t = useT("home");
  const releves = historique.filter((h) => h.releveTTC !== null);

  return (
    <section id="prix" className="mt-16 scroll-mt-24">
      <h2 className="font-serif text-3xl text-[#5a1f2b]">
        {t("prices.title")}
      </h2>
      <p className="mt-2 text-sm text-stone-500">
        {t("prices.intro")}
      </p>

      <div className="mt-6">
        <PriceStats />
      </div>
      <p className="mt-3 text-sm text-stone-600">
        {t("prices.repere", {
          ttc: souscription2025.prixTTC,
          ht: htFromTTC(souscription2025.prixTTC),
          distributor: souscription2025.distributeur,
          date: souscription2025.date,
        })}
      </p>

      <div className="mt-8 grid items-stretch gap-8 lg:grid-cols-[200px_1fr]">
        <div className="relative mx-auto hidden aspect-[1/4] w-full max-w-[120px] self-center lg:block">
          <Image
            src="/bottle-demoiselles.webp"
            alt="Bouteille de Château Coutet Les Demoiselles"
            fill
            className="object-contain"
            sizes="120px"
          />
        </div>

        <div className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white">
          <h3 className="px-6 pb-1 pt-5 font-serif text-xl text-[#5a1f2b]">
            {t("prices.tableTitle")}
          </h3>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-6 py-3 font-medium">{t("prices.thVintage")}</th>
                  <th className="px-6 py-3 text-right font-medium">{t("prices.thObserved")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {releves.map((h) => (
                  <tr key={h.millesime}>
                    <td className="px-6 py-3 font-serif text-base text-stone-800">
                      {h.millesime}
                      {h.releveStatut === "souscription" && (
                        <span className="ml-2 text-xs text-stone-500">{t("prices.badgeSubscription")}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {h.releveTTC} €
                      <span className="block text-xs text-stone-400">
                        {t("prices.htApprox", { price: htFromTTC(h.releveTTC as number) })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-stone-100 px-6 py-3 text-xs text-stone-500">
            {t("prices.tableSource", { source: t("prices.sourceDetail") })}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        <CountryPriceBars />
      </div>

      <div className="mt-8">
        <h3 className="font-serif text-xl text-[#5a1f2b]">
          {t("prices.verifyTitle")}
        </h3>
        <div className="mt-4 flex flex-wrap gap-3">
          {distributeurs.map((d) => (
            <a
              key={d.nom}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm text-stone-700 hover:border-[#5a1f2b] hover:text-[#5a1f2b]"
            >
              {d.nom}
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-stone-400">
                {t("prices.zones." + d.zoneKey)}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path
                    d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </a>
          ))}
        </div>
        <p className="mt-4 text-sm text-stone-500">
          {t("prices.sourcesPrefix")}{" "}
          <LocaleLink href="/domain/chateau-coutet" className="underline hover:text-[#5a1f2b]">
            {t("prices.discoverEstateLink")}
          </LocaleLink>
          {t("prices.sourcesSuffix")}
        </p>
      </div>
    </section>
  );
}
