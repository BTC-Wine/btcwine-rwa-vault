import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { LocaleLink } from "@/components/LocaleLink";
import { getT } from "@/lib/i18n/server";
import { pageAlternates } from "@/lib/seo";
import { domaine } from "@/lib/domaine";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getT(lang, "howItWorks");
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: pageAlternates(lang, "/how-it-works"),
  };
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-[#5a1f2b]"
    >
      {children}
    </a>
  );
}

function Int({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <LocaleLink href={href} className="underline hover:text-[#5a1f2b]">
      {children}
    </LocaleLink>
  );
}

export default async function CommentCaMarchePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getT(lang, "howItWorks");

  const etapes: { titre: string; texte: React.ReactNode }[] = [
    {
      titre: t("steps.s1.title"),
      texte: (
        <>
          {t("steps.s1.beforeWallets")}
          <Ext href="https://www.freighter.app">Freighter</Ext>,{" "}
          <Ext href="https://xbull.app">xBull</Ext>,{" "}
          <Ext href="https://lobstr.co">Lobstr</Ext>
          {t("steps.s1.afterWallets")}
        </>
      ),
    },
    {
      titre: t("steps.s2.title"),
      texte: (
        <>
          {t("steps.s2.beforeLink")}
          <Ext href="https://stellar.expert">{t("steps.s2.linkExplorer")}</Ext>
          {t("steps.s2.afterLink")}
        </>
      ),
    },
    {
      titre: t("steps.s3.title"),
      texte: (
        <>
          {t("steps.s3.p1")}
          <Int href="/domain/chateau-coutet">{t("steps.s3.linkTerroir")}</Int>
          {t("steps.s3.p2")}
          <Ext href={domaine.partenaires.stockage.url}>Bordeaux City Bond</Ext>
          {t("steps.s3.p3")}
          <Ext href={domaine.partenaires.assurance.url}>AXA</Ext>
          {t("steps.s3.p4")}
        </>
      ),
    },
    {
      titre: t("steps.s4.title"),
      texte: t("steps.s4.text"),
    },
    {
      titre: t("steps.s5.title"),
      texte: t("steps.s5.text"),
    },
  ];

  const garanties: { titre: string; texte: React.ReactNode }[] = [
    {
      titre: t("guarantees.g1.title"),
      texte: (
        <>
          {t("guarantees.g1.beforeLink")}
          <Ext href="https://stellar.expert">{t("guarantees.g1.linkRegistry")}</Ext>
          {t("guarantees.g1.afterLink")}
        </>
      ),
    },
    {
      titre: t("guarantees.g2.title"),
      texte: (
        <>
          {t("guarantees.g2.p1")}
          <Int href="/domain/chateau-coutet">{t("guarantees.g2.linkTerroir")}</Int>
          {t("guarantees.g2.p2")}
          <Ext href={domaine.site}>Château Coutet</Ext>
          {t("guarantees.g2.p3")}
        </>
      ),
    },
    {
      titre: t("guarantees.g3.title"),
      texte: (
        <>
          {t("guarantees.g3.p1")}
          <Ext href={domaine.partenaires.stockage.url}>Bordeaux City Bond</Ext>
          {t("guarantees.g3.p2")}
          <Ext href={domaine.partenaires.assurance.url}>AXA</Ext>
          {t("guarantees.g3.p3")}
        </>
      ),
    },
    {
      titre: t("guarantees.g4.title"),
      texte: t("guarantees.g4.text"),
    },
    {
      titre: t("guarantees.g5.title"),
      texte: t("guarantees.g5.text"),
    },
  ];

  const faq: { q: string; r: React.ReactNode }[] = [
    {
      q: t("faq.q1.q"),
      r: (
        <>
          {t("faq.q1.before")}
          <Ext href="mailto:contact@terwa.io">{t("faq.q1.link")}</Ext>
          {t("faq.q1.after")}
        </>
      ),
    },
    {
      q: t("faq.q2.q"),
      r: t("faq.q2.a"),
    },
    {
      q: t("faq.q3.q"),
      r: t("faq.q3.a"),
    },
    {
      q: t("faq.q4.q"),
      r: t("faq.q4.a"),
    },
    {
      q: t("faq.q5.q"),
      r: (
        <>
          {t("faq.q5.p1")}
          <Int href="/domain/chateau-coutet">{t("faq.q5.linkDomain")}</Int>
          {t("faq.q5.p2")}
          <Int href="/#prix">{t("faq.q5.linkPrices")}</Int>
          {t("faq.q5.p3")}
          <Ext href="https://stellar.expert">{t("faq.q5.linkRegistry")}</Ext>
          {t("faq.q5.p4")}
        </>
      ),
    },
  ];

  // Version texte brut de la FAQ pour le JSON-LD : les reponses rendues en
  // JSX ci-dessus sont reconstruites en concatenant les segments du
  // dictionnaire, dans le meme ordre que l'affichage.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        q: t("faq.q1.q"),
        a: `${t("faq.q1.before")}${t("faq.q1.link")}${t("faq.q1.after")}`,
      },
      { q: t("faq.q2.q"), a: t("faq.q2.a") },
      { q: t("faq.q3.q"), a: t("faq.q3.a") },
      { q: t("faq.q4.q"), a: t("faq.q4.a") },
      {
        q: t("faq.q5.q"),
        a: `${t("faq.q5.p1")}${t("faq.q5.linkDomain")}${t("faq.q5.p2")}${t("faq.q5.linkPrices")}${t("faq.q5.p3")}${t("faq.q5.linkRegistry")}${t("faq.q5.p4")}`,
      },
    ].map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <JsonLd data={faqJsonLd} />
      <section className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
          {t("hero.kicker")}
        </p>
        <h1 className="mt-3 font-serif text-5xl text-[#5a1f2b]">{t("hero.title")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-600">{t("hero.intro")}</p>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-3xl text-[#5a1f2b]">{t("journey.title")}</h2>
        <ol className="mt-6 space-y-4">
          {etapes.map((e, i) => (
            <li key={e.titre} className="flex gap-5 rounded-2xl border border-stone-200 bg-white p-6">
              <span className="font-serif text-3xl text-stone-300">{i + 1}</span>
              <div>
                <h3 className="font-serif text-xl text-[#5a1f2b]">{e.titre}</h3>
                <p className="mt-1 text-sm text-stone-600">{e.texte}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-3xl text-[#5a1f2b]">{t("protections.title")}</h2>
        <div className="mt-6 space-y-4">
          {garanties.map((g) => (
            <div key={g.titre} className="rounded-2xl border border-stone-200 bg-white p-6">
              <h3 className="font-serif text-xl text-[#5a1f2b]">{g.titre}</h3>
              <p className="mt-1 text-sm text-stone-600">{g.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-3xl text-[#5a1f2b]">{t("faq.title")}</h2>
        <div className="mt-6 space-y-3">
          {faq.map((f) => (
            <details key={f.q} className="rounded-2xl border border-stone-200 bg-white">
              <summary className="cursor-pointer px-6 py-4 font-medium text-stone-800">
                {f.q}
              </summary>
              <p className="border-t border-stone-100 px-6 py-4 text-sm text-stone-600">
                {f.r}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <h2 className="font-serif text-2xl text-[#5a1f2b]">{t("cta.title")}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-stone-600">
          {t("cta.text", { appellation: domaine.appellation, nom: domaine.nom })}
        </p>
        <LocaleLink
          href="/#cuvee"
          className="mt-5 inline-block min-h-11 rounded-xl bg-[#5a1f2b] px-6 py-3 text-white hover:bg-[#71303e]"
        >
          {t("cta.button")}
        </LocaleLink>
      </section>
    </div>
  );
}
