"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BOTTLES_PER_TOKEN, TOKENS_PER_ALLOCATION, STROOPS, config } from "@/lib/config";
import { historique, htFromTTC, prixActuels } from "@/lib/domaine";
import { loadOverview, type VaultOverview } from "@/lib/soroban";
import { BuyCard } from "./BuyCard";
import { Comparaison } from "./Comparaison";
import { useT } from "./I18nProvider";
import { LocaleLink } from "./LocaleLink";
import { PrixReference } from "./PrixReference";

const lienPartenaire = (nom: string, url: string) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="underline hover:text-[#5a1f2b]"
  >
    {nom}
  </a>
);

export function Cuvee() {
  const t = useT("home");
  const [overview, setOverview] = useState<VaultOverview | null>(null);
  const [error, setError] = useState(false);

  const piliers: { titre: string; texte: React.ReactNode }[] = [
    {
      titre: t("pillars.reserved.title"),
      texte: t("pillars.reserved.text"),
    },
    {
      titre: t("pillars.conserved.title"),
      texte: (
        <>
          {t("pillars.conserved.p1")}{" "}
          {lienPartenaire("Bordeaux City Bond", "https://www.bordeauxcitybond.com")}{" "}
          {t("pillars.conserved.p2")}{" "}
          {lienPartenaire("AXA", "https://www.axa.fr")}
          {t("pillars.conserved.p3")}
        </>
      ),
    },
    {
      titre: t("pillars.choose.title"),
      texte: t("pillars.choose.text"),
    },
  ];

  useEffect(() => {
    loadOverview().then(setOverview).catch(() => setError(true));
  }, []);

  const pctMax = Math.round(
    (1 -
      prixActuels.precommande /
        Math.max(
          ...historique
            .filter((h) => h.releveTTC !== null)
            .map((h) => htFromTTC(h.releveTTC as number))
        )) *
      100
  );

  const soldAllocations = overview ? Number(overview.soldLots) : null;
  const totalAllocations = overview ? Number(overview.maxSupply) : null;
  const pricePerAllocation = overview
    ? Number(overview.unitPrice / STROOPS) * TOKENS_PER_ALLOCATION
    : null;

  return (
    <div>
      {/* Le projet d'abord : la maison TERWA */}
      <section className="relative flex min-h-[560px] items-center overflow-hidden">
        <Image
          src="/hero-vignoble.jpg"
          alt="Les vignes du Château Coutet à Saint-Émilion"
          fill
          priority
          quality={55}
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#faf7f2] via-[#faf7f2]/85 to-[#faf7f2]/20" />
        <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between gap-10 px-6 py-20">
          <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#5a1f2b]">
            {t("hero.kicker")}
          </p>
          <h1 className="mt-4 font-serif text-5xl leading-tight text-[#5a1f2b] lg:text-6xl">
            <span className="sm:whitespace-nowrap">{t("hero.titleLine1")}</span>{" "}
            <br className="hidden sm:block" />
            {t("hero.titleLine2")}
          </h1>
          <p className="mt-5 max-w-lg text-lg text-stone-700">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#cuvee"
              className="min-h-11 rounded-xl bg-[#5a1f2b] px-6 py-3 text-white hover:bg-[#71303e]"
            >
              {t("hero.ctaDiscover")}
            </a>
            <LocaleLink
              href="/domain/chateau-coutet"
              className="min-h-11 rounded-xl border border-stone-400 bg-white/70 px-6 py-3 text-stone-800 hover:border-[#5a1f2b] hover:text-[#5a1f2b]"
            >
              {t("hero.ctaDomain")}
            </LocaleLink>
          </div>
          </div>

          <div className="hidden shrink-0 rounded-2xl border border-[#5a1f2b]/15 bg-white/70 p-8 text-center backdrop-blur lg:block">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              {t("hero.discountLabel")}
            </p>
            <p
              className="mt-1 font-serif text-7xl leading-none text-[#5a1f2b]"
              title={t("hero.discountTitle")}
            >
              -{pctMax}&nbsp;%<span className="align-super text-2xl">*</span>
            </p>
            <p className="mx-auto mt-3 max-w-[210px] text-sm text-stone-600">
              {t("hero.discountCaption")}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 pb-12">
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {piliers.map((p, i) => (
            <div key={p.titre} className="rounded-2xl border border-stone-200 bg-white p-8">
              <p className="font-serif text-lg text-stone-400">0{i + 1}</p>
              <h2 className="mt-1 font-serif text-2xl text-[#5a1f2b]">{p.titre}</h2>
              <p className="mt-3 text-sm text-stone-600">{p.texte}</p>
            </div>
          ))}
        </section>

        {/* Le catalogue */}
        <section id="cuvees" className="mt-16 scroll-mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.15em] text-stone-500">
            {t("catalog.kicker")}
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[#5a1f2b]">{t("catalog.title")}</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <a
              href="#cuvee"
              className="group flex gap-5 rounded-2xl border border-stone-200 bg-white p-6 hover:border-[#5a1f2b]"
            >
              <div className="relative w-14 shrink-0">
                <Image
                  src="/bottle-demoiselles.webp"
                  alt=""
                  fill
                  className="object-contain"
                  sizes="56px"
                />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#5a1f2b]">
                  {t("catalog.cuvee1Tag")}
                </p>
                <p className="mt-1 font-serif text-2xl text-stone-900">{t("catalog.cuvee1Name")}</p>
                <p className="text-sm text-stone-500">
                  {t("catalog.cuvee1Sub")}
                </p>
                <p className="mt-2 text-sm text-stone-600">
                  {pricePerAllocation !== null
                    ? t("catalog.priceLine", {
                        price: pricePerAllocation.toLocaleString("fr-FR"),
                      })
                    : "..."}
                  <span className="ml-2 text-[#5a1f2b] group-hover:underline">{t("catalog.discover")}</span>
                </p>
              </div>
            </a>
            {[t("catalog.soonName2"), t("catalog.soonName3")].map((c) => (
              <div
                key={c}
                className="flex items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/50 p-6 text-center"
              >
                <div>
                  <p className="font-serif text-2xl text-stone-400">{c}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {t("catalog.soonDesc")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* La cuvee nº 1 en detail */}
        <section id="cuvee" className="mt-24 scroll-mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.15em] text-[#5a1f2b]">
            {t("cuvee.tag")}
          </p>
          <h2 className="mt-2 font-serif text-4xl text-[#5a1f2b]">{t("cuvee.name")}</h2>
          <p className="mt-1 text-stone-600">
            {t("cuvee.description", {
              bottles: TOKENS_PER_ALLOCATION * BOTTLES_PER_TOKEN,
            })}
          </p>
        </section>

        {error ? (
          <p className="py-16 text-center text-stone-500">
            {t("cuvee.error")}
          </p>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <Stat
                label={t("stats.reserved")}
                value={
                  soldAllocations !== null && totalAllocations !== null
                    ? `${soldAllocations.toLocaleString("fr-FR")} / ${totalAllocations.toLocaleString("fr-FR")}`
                    : "..."
                }
              />
              <Stat
                label={t("stats.price")}
                value={
                  pricePerAllocation !== null
                    ? `${pricePerAllocation.toLocaleString("fr-FR")} USDC`
                    : "..."
                }
              />
              <Stat
                label={t("stats.status")}
                value={
                  overview
                    ? overview.state === "Presale"
                      ? t("stats.statusOpen")
                      : t("stats.statusClosed")
                    : "..."
                }
              />
            </section>

            <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
              <div>
                <h3 className="font-serif text-3xl text-[#5a1f2b]">{t("vintages.title")}</h3>
                <p className="mt-1 text-sm text-stone-500">
                  {t("vintages.subtitle")}
                </p>
                <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
                  {config.vintages.map((v) => (
                    <li key={v} className="flex items-center justify-between gap-4 px-6 py-4">
                      <div>
                        <p className="font-serif text-lg text-stone-800">{t("vintages.item", { year: v })}</p>
                        <p className="text-sm text-stone-500">
                          {t("vintages.bottlesPerAllocation", { bottles: BOTTLES_PER_TOKEN })}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm text-stone-600">
                        {t("vintages.availableOn")}
                        <br className="sm:hidden" /> 01/06/{Number(v) + 2}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                {overview ? (
                  <BuyCard overview={overview} />
                ) : (
                  <div
                    className="min-h-[420px] animate-pulse rounded-2xl border border-stone-200 bg-white p-8"
                    aria-hidden
                  >
                    <div className="h-6 w-40 rounded bg-stone-100" />
                    <div className="mt-4 h-4 w-full rounded bg-stone-100" />
                    <div className="mt-2 h-4 w-2/3 rounded bg-stone-100" />
                    <div className="mt-8 h-10 w-full rounded-xl bg-stone-100" />
                  </div>
                )}
              </div>
            </section>

            <Comparaison />

            <PrixReference />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-1 font-serif text-2xl text-[#5a1f2b]">{value}</p>
    </div>
  );
}
