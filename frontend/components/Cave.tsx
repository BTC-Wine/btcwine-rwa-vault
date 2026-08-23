"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BOTTLES_PER_TOKEN, STROOPS, TOKENS_PER_ALLOCATION, config } from "@/lib/config";
import { domaine, prixActuels } from "@/lib/domaine";
import { loadOverview, type VaultOverview } from "@/lib/soroban";
import { loadBalances, type Balances } from "@/lib/trustlines";
import { useT } from "@/components/I18nProvider";
import { LocaleLink } from "@/components/LocaleLink";
import { isDemo } from "@/lib/demo";
import { CaveHistorique } from "./CaveHistorique";
import { CaveSuivi } from "./CaveSuivi";
import { VintagePanel } from "./VintageActions";
import { useWallet } from "./WalletProvider";

function short(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function Cave() {
  const t = useT("cellar");
  const { address, connect } = useWallet();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [overview, setOverview] = useState<VaultOverview | null>(null);
  const [error, setError] = useState(false);
  const [managed, setManaged] = useState<number | null>(null);

  useEffect(() => {
    loadOverview().then(setOverview).catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) return;
    setBalances(null);
    loadBalances(address).then(setBalances).catch(() => setError(true));
  }, [address]);

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="relative mx-auto h-40 w-12">
          <Image src="/bottle-demoiselles.webp" alt="" fill className="object-contain" sizes="48px" />
        </div>
        <h1 className="mt-6 font-serif text-4xl text-[#5a1f2b]">{t("title")}</h1>
        <p className="mt-3 text-stone-600">{t("connect.prompt")}</p>
        <button
          onClick={connect}
          className="mt-6 min-h-11 rounded-xl bg-[#5a1f2b] px-6 py-3 text-white hover:bg-[#71303e]"
        >
          {t("connect.button")}
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-24 text-center text-stone-500">{t("error")}</p>
    );
  }

  const unitUsdc = overview ? Number(overview.unitPrice / STROOPS) : null; // par token
  const rows = config.vintages.map((v, i) => {
    const code = config.tokenCodes[i];
    const tokens = balances ? Math.floor(Number(balances[code] ?? "0")) : null;
    const dispoDate = new Date(`${Number(v) + 2}-06-01`);
    // en mode demo, le premier millesime est presente comme disponible
    const enElevage = isDemo() && i === 0 ? false : dispoDate.getTime() > Date.now();
    return {
      index: i,
      vintage: v,
      tokens,
      bouteilles: tokens !== null ? tokens * BOTTLES_PER_TOKEN : null,
      available: `01/06/${Number(v) + 2}`,
      enElevage,
      coutUsdc: tokens !== null && unitUsdc !== null ? tokens * unitUsdc : null,
      coutEur: tokens !== null ? tokens * prixActuels.precommande * BOTTLES_PER_TOKEN : null,
    };
  });

  const totalTokens = rows.reduce((a, r) => a + (r.tokens ?? 0), 0);
  const totalBottles = totalTokens * BOTTLES_PER_TOKEN;
  const allocations = Math.min(...rows.map((r) => r.tokens ?? 0));
  const coutTotalUsdc = unitUsdc !== null ? totalTokens * unitUsdc : null;
  const coutTotalEur = totalTokens * prixActuels.precommande * BOTTLES_PER_TOKEN;
  const usdcSolde = balances && config.usdmCode in balances ? Number(balances[config.usdmCode]) : null;
  const prochaine = rows.find((r) => (r.tokens ?? 0) > 0 && r.enElevage);

  const tiles = [
    { label: t("tiles.bottles.label"), value: balances ? `${totalBottles}` : "...", note: t("tiles.bottles.note") },
    { label: t("tiles.allocations.label"), value: balances ? `${allocations}` : "...", note: t("tiles.allocations.note", { n: TOKENS_PER_ALLOCATION }) },
    {
      label: t("tiles.cost.label"),
      value: coutTotalUsdc !== null && balances ? t("tiles.cost.value", { amount: coutTotalUsdc.toLocaleString("fr-FR") }) : "...",
      note: balances ? t("tiles.cost.note", { amount: Math.round(coutTotalEur).toLocaleString("fr-FR") }) : "",
    },
    {
      label: t("tiles.nextRelease.label"),
      value: prochaine ? prochaine.available : balances ? t("tiles.nextRelease.none") : "...",
      note: prochaine ? t("tiles.nextRelease.note", { vintage: prochaine.vintage }) : "",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-4xl text-[#5a1f2b]">{t("title")}</h1>
        <p className="font-mono text-xs text-stone-500">{short(address)}</p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">{t.label}</p>
            <p className="mt-1 font-serif text-2xl text-[#5a1f2b]">{t.value}</p>
            <p className="mt-0.5 text-xs text-stone-500">{t.note}</p>
          </div>
        ))}
      </div>

      {balances && totalTokens === 0 ? (
        <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-10 text-center">
          <div className="relative mx-auto h-40 w-12">
            <Image src="/bottle-demoiselles.webp" alt="" fill className="object-contain" sizes="48px" />
          </div>
          <p className="mt-4 font-serif text-2xl text-[#5a1f2b]">{t("empty.title")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{t("empty.body")}</p>
          <LocaleLink
            href="/#cuvee"
            className="mt-5 inline-block min-h-11 rounded-xl bg-[#5a1f2b] px-6 py-3 text-white hover:bg-[#71303e]"
          >
            {t("empty.cta")}
          </LocaleLink>
        </div>
      ) : (
        <div className="mt-10 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="relative">
            <div className="relative h-40 w-full">
              <Image
                src="/domaine-famille.jpg"
                alt="Les vignes du Château Coutet"
                fill
                className="object-cover object-[50%_35%]"
                sizes="(max-width: 1024px) 100vw, 1024px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
              <div className="absolute bottom-4 left-6 text-white">
                <p className="text-xs font-medium uppercase tracking-[0.15em] opacity-90">
                  {t("card.kicker")}
                </p>
                <p className="font-serif text-3xl">Les Demoiselles</p>
                <p className="text-sm opacity-90">
                  {domaine.nom}, {domaine.appellation}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[130px_1fr]">
            <div className="relative mx-auto hidden w-[90px] py-8 lg:block">
              <div className="relative h-full min-h-[320px]">
                <Image
                  src="/bottle-demoiselles.webp"
                  alt="Bouteille de Château Coutet Les Demoiselles"
                  fill
                  className="object-contain"
                  sizes="90px"
                />
              </div>
            </div>

            <ul className="divide-y divide-stone-100 lg:border-l lg:border-stone-100">
              {rows.map((r) => (
                <li key={r.vintage} className="px-6 py-5">
                  <div className="grid grid-cols-2 items-center gap-y-2 sm:grid-cols-[140px_290px_200px_92px] sm:justify-between sm:gap-y-0">
                    <div>
                      <p className="font-serif text-lg text-stone-800">
                        {t("card.vintage", { vintage: r.vintage })}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {r.bouteilles === null ? "..." : t("card.bottles", { n: r.bouteilles })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                          r.enElevage
                            ? "bg-stone-100 text-stone-700"
                            : "bg-green-50 text-green-800"
                        }`}
                      >
                        {r.enElevage ? t("card.aging") : t("card.available")}
                      </span>
                      <span className="text-xs text-stone-500">
                        {r.enElevage ? t("card.releaseOn", { date: r.available }) : t("card.readyForYou")}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-base tabular-nums text-stone-800">
                        {r.coutUsdc === null ? "..." : t("card.cost", { amount: r.coutUsdc.toLocaleString("fr-FR") })}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-xs text-stone-500">
                        {t("card.costLabel")}
                        {r.coutEur !== null && ` · ${t("card.costEur", { amount: Math.round(r.coutEur).toLocaleString("fr-FR") })}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {r.enElevage ? (
                        <button
                          disabled
                          title={t("actions.manageLocked", { date: r.available })}
                          className="min-h-10 cursor-not-allowed rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-400"
                        >
                          {t("actions.manage")}
                        </button>
                      ) : (
                        r.tokens !== null &&
                        r.tokens > 0 && (
                          <button
                            onClick={() => setManaged(managed === r.index ? null : r.index)}
                            aria-expanded={managed === r.index}
                            className={`min-h-10 rounded-lg px-4 py-2 text-sm ${
                              managed === r.index
                                ? "bg-[#5a1f2b] text-white"
                                : "border border-[#5a1f2b] text-[#5a1f2b] hover:bg-[#5a1f2b] hover:text-white"
                            }`}
                          >
                            {t("actions.manage")}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  {managed === r.index && r.tokens !== null && r.tokens > 0 && (
                    <VintagePanel
                      vaultIndex={r.index}
                      vintage={r.vintage}
                      tokens={r.tokens}
                      bottles={r.bouteilles ?? 0}
                      address={address}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-6 py-4 text-sm text-stone-600">
            <p>{t("card.footerNote")}</p>
            <LocaleLink
              href="/domain/chateau-coutet"
              className="whitespace-nowrap text-[#5a1f2b] underline"
            >
              {t("card.viewEstate")}
            </LocaleLink>
          </div>
        </div>
      )}

      <CaveSuivi address={address} />
      <CaveHistorique address={address} />

      {usdcSolde !== null && (
        <p className="mt-4 text-sm text-stone-500">
          {t("paymentBalance", { amount: usdcSolde.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) })}
        </p>
      )}
    </div>
  );
}
