import { htmlLang, locales } from "@/lib/i18n/config";
import { SITE_URL } from "./site";

// Alternates hreflang + canonical d'une page. `path` commence par "/" ou est
// vide pour l'accueil. x-default pointe vers la racine qui detecte la langue.
export function pageAlternates(lang: string, path: string) {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[htmlLang[l]] = `${SITE_URL}/${l}${path}`;
  }
  languages["x-default"] = `${SITE_URL}${path === "" ? "/" : path === "/" ? "/" : `/en${path}`}`;
  return {
    canonical: `${SITE_URL}/${lang}${path}`,
    languages,
  };
}
