import type { Metadata } from "next";
import Image from "next/image";
import { JsonLd } from "@/components/JsonLd";
import { domaine, historique, htFromTTC } from "@/lib/domaine";
import { getT } from "@/lib/i18n/server";
import { pageAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getT(lang, "domain");
  return {
    title: t("estate.metaTitle"),
    description: t("estate.metaDescription"),
    alternates: pageAlternates(lang, "/domain/chateau-coutet"),
  };
}

const FACT_IDS = [
  "family",
  "chemistry",
  "estate",
  "horse",
  "genetics",
  "rating",
] as const;

export default async function DomainePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getT(lang, "domain");
  const tCommon = await getT(lang, "common");

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "TERWA",
        item: `${SITE_URL}/${lang}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: tCommon("nav.domains"),
        item: `${SITE_URL}/${lang}/domain`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: domaine.nom,
        item: `${SITE_URL}/${lang}/domain/chateau-coutet`,
      },
    ],
  };

  const winery = {
    "@context": "https://schema.org",
    "@type": "Winery",
    name: domaine.nom,
    url: domaine.site,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Saint-Émilion",
      addressCountry: "FR",
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <JsonLd data={breadcrumb} />
      <JsonLd data={winery} />
      <section className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
          {domaine.appellation}
        </p>
        <h1 className="mt-3 font-serif text-5xl text-[#5a1f2b]">{domaine.nom}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-600">{t("estate.heroIntro")}</p>
      </section>

      <div className="relative mt-16 aspect-[2/1] overflow-hidden rounded-2xl border border-stone-200">
        <Image
          src="/domaine-famille.jpg"
          alt={t("estate.heroAlt")}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 1024px"
          priority
        />
      </div>
      <p className="mt-3 text-center text-sm text-stone-500">{t("estate.caption")}</p>

      <section className="mt-16">
        <h2 className="font-serif text-3xl text-[#5a1f2b]">{t("estate.factsTitle")}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACT_IDS.map((id) => (
            <div key={id} className="rounded-2xl border border-stone-200 bg-white p-6">
              <p className="font-serif text-2xl text-[#5a1f2b]">
                {t(`facts.${id}.valeur`)}
              </p>
              <p className="mt-2 text-sm text-stone-600">{t(`facts.${id}.detail`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid items-start gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl text-[#5a1f2b]">
            {t("estate.terroirTitle", { name: domaine.terroir.nom })}
          </h2>
          <p className="mt-4 text-stone-600">{t("estate.terroirDescription")}</p>
          <p className="mt-4 text-stone-600">
            {t("estate.storagePre")}
            <a
              href={domaine.partenaires.stockage.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#5a1f2b]"
            >
              {domaine.partenaires.stockage.nom}
            </a>
            {t("estate.storageMid")}
            <a
              href={domaine.partenaires.assurance.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#5a1f2b]"
            >
              {domaine.partenaires.assurance.nom}
            </a>
            {t("estate.storagePost")}
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-stone-200">
          <Image
            src="/terroir-peycocut.jpg"
            alt={t("estate.terroirAlt")}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 512px"
          />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-3xl text-[#5a1f2b]">{t("estate.productionTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">{t("estate.productionIntro")}</p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="px-6 py-3 font-medium">{t("estate.tableVintage")}</th>
                <th className="px-6 py-3 text-right font-medium">{t("estate.tableBottles")}</th>
                <th className="px-6 py-3 text-right font-medium">{t("estate.tablePrice")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {historique.map((h) => (
                <tr key={h.millesime}>
                  <td className="px-6 py-3 font-serif text-base text-stone-800">
                    {h.millesime}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {h.production.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {h.releveTTC ? (
                      <>
                        {h.releveTTC} {t("estate.inclTax")}
                        {h.releveStatut === "souscription" && (
                          <span className="ml-1 text-xs text-stone-500">
                            {t("estate.subscription")}
                          </span>
                        )}
                        <span className="block text-xs text-stone-400">
                          ≈ {htFromTTC(h.releveTTC)} {t("estate.exclTax")}
                        </span>
                      </>
                    ) : (
                      <span className="text-stone-400">{t("estate.offMarket")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-stone-500">{t("estate.productionNote")}</p>
      </section>
    </div>
  );
}
