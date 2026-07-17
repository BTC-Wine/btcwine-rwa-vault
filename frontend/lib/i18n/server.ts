import "server-only";
import { getDictionary } from "./dictionaries";
import { makeT } from "./translate";
import { isLocale, defaultLocale, type Locale } from "./config";

// Raccourci pour les composants serveur (pages) : recupere une fonction t liee
// a un namespace a partir du parametre de route `lang`.
export async function getT(lang: string, namespace: string) {
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const dict = await getDictionary(locale);
  return makeT(dict, namespace);
}
