import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Robots: tout le site est indexable, le sitemap liste les pages localisees.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
