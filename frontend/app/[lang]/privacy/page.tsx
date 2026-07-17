import type { Metadata } from "next";
import { LegalComingSoon } from "@/components/LegalComingSoon";
import { getT } from "@/lib/i18n/server";
import { pageAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getT(lang, "legal");
  return {
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDescription"),
    alternates: pageAlternates(lang, "/privacy"),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <LegalComingSoon lang={lang} titleKey="privacy.title" />;
}
