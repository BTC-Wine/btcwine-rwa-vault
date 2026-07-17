import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { pageAlternates } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

// Pages statiques du site avec leur priorite relative dans le sitemap.
const pages: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1.0 },
  { path: "/domain", priority: 0.8 },
  { path: "/domain/chateau-coutet", priority: 0.6 },
  { path: "/how-it-works", priority: 0.8 },
  { path: "/cellar", priority: 0.6 },
  { path: "/legal", priority: 0.6 },
  { path: "/terms", priority: 0.6 },
  { path: "/privacy", priority: 0.6 },
];

// Chaque page est declaree une fois par locale, avec ses alternates hreflang.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return pages.flatMap(({ path, priority }) =>
    locales.map((lang) => ({
      url: `${SITE_URL}/${lang}${path}`,
      lastModified,
      priority,
      alternates: { languages: pageAlternates(lang, path).languages },
    })),
  );
}
