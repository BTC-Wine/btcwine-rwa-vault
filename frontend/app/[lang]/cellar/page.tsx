import type { Metadata } from "next";
import { Cave } from "@/components/Cave";
import { getT } from "@/lib/i18n/server";
import { pageAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getT(lang, "cellar");
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: pageAlternates(lang, "/cellar"),
  };
}

export default function CavePage() {
  return <Cave />;
}
