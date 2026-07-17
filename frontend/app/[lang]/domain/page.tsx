import type { Metadata } from "next";
import Image from "next/image";
import { JsonLd } from "@/components/JsonLd";
import { LocaleLink } from "@/components/LocaleLink";
import { domaine } from "@/lib/domaine";
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
    title: t("list.metaTitle"),
    description: t("list.metaDescription"),
    alternates: pageAlternates(lang, "/domain"),
  };
}

export default async function DomainesPage({
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
    ],
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <JsonLd data={breadcrumb} />
      <section className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
          {t("list.kicker")}
        </p>
        <h1 className="mt-3 font-serif text-5xl text-[#5a1f2b]">{t("list.title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-600">{t("list.intro")}</p>
      </section>

      <div className="mt-16 grid gap-4 lg:grid-cols-3">
        <LocaleLink
          href="/domain/chateau-coutet"
          className="group overflow-hidden rounded-2xl border border-stone-200 bg-white hover:border-[#5a1f2b] lg:col-span-2"
        >
          <div className="relative aspect-[21/9]">
            <Image
              src="/domaine-famille.jpg"
              alt={t("list.featuredAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 680px"
            />
          </div>
          <div className="p-6">
            <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#5a1f2b]">
              {t("list.featuredBadge")}
            </p>
            <p className="mt-1 font-serif text-3xl text-stone-900">{domaine.nom}</p>
            <p className="text-sm text-stone-500">{domaine.appellation}</p>
            <p className="mt-3 text-sm text-stone-600">{t("list.featuredSummary")}</p>
            <p className="mt-3 text-sm text-[#5a1f2b] group-hover:underline">
              {t("list.featuredCta")}
            </p>
          </div>
        </LocaleLink>

        <div className="flex flex-col gap-4">
          {[2, 3].map((n) => (
            <div
              key={n}
              className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/50 p-6 text-center"
            >
              <div>
                <p className="font-serif text-2xl text-stone-400">
                  {t("list.upcomingName", { n })}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {t("list.upcomingDescription")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
