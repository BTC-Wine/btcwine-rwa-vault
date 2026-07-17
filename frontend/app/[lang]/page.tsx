import type { Metadata } from "next";
import { Cuvee } from "@/components/Cuvee";
import { JsonLd } from "@/components/JsonLd";
import { htmlLang, isLocale, defaultLocale } from "@/lib/i18n/config";
import { pageAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// Seuls les alternates sont definis ici : le titre et la description de
// l'accueil restent ceux du layout.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return {
    alternates: pageAlternates(lang, ""),
  };
}

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : defaultLocale;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "TERWA",
          url: SITE_URL,
          logo: `${SITE_URL}/og-image.jpg`,
          email: "contact@terwa.io",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Terwa.io",
          alternateName: "TERWA",
          url: SITE_URL,
          inLanguage: htmlLang[locale],
        }}
      />
      <Cuvee />
    </>
  );
}
