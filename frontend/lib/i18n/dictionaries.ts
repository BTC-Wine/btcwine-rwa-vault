import "server-only";
import type { Locale } from "./config";
import type { Messages } from "./translate";

// Un dictionnaire complet = un objet indexe par namespace. Chaque namespace
// vit dans son propre fichier JSON sous dictionaries/<locale>/, ce qui permet
// a plusieurs contributeurs de travailler sur des sections differentes sans
// conflit. Les imports sont statiques (pas de template dynamique) pour rester
// compatibles avec le bundling.
export type Dictionary = Record<string, Messages>;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: async () => ({
    common: (await import("@/dictionaries/en/common.json")).default,
    home: (await import("@/dictionaries/en/home.json")).default,
    domain: (await import("@/dictionaries/en/domain.json")).default,
    howItWorks: (await import("@/dictionaries/en/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/en/cellar.json")).default,
    buy: (await import("@/dictionaries/en/buy.json")).default,
    legal: (await import("@/dictionaries/en/legal.json")).default,
  }),
  fr: async () => ({
    common: (await import("@/dictionaries/fr/common.json")).default,
    home: (await import("@/dictionaries/fr/home.json")).default,
    domain: (await import("@/dictionaries/fr/domain.json")).default,
    howItWorks: (await import("@/dictionaries/fr/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/fr/cellar.json")).default,
    buy: (await import("@/dictionaries/fr/buy.json")).default,
    legal: (await import("@/dictionaries/fr/legal.json")).default,
  }),
  de: async () => ({
    common: (await import("@/dictionaries/de/common.json")).default,
    home: (await import("@/dictionaries/de/home.json")).default,
    domain: (await import("@/dictionaries/de/domain.json")).default,
    howItWorks: (await import("@/dictionaries/de/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/de/cellar.json")).default,
    buy: (await import("@/dictionaries/de/buy.json")).default,
    legal: (await import("@/dictionaries/de/legal.json")).default,
  }),
  zh: async () => ({
    common: (await import("@/dictionaries/zh/common.json")).default,
    home: (await import("@/dictionaries/zh/home.json")).default,
    domain: (await import("@/dictionaries/zh/domain.json")).default,
    howItWorks: (await import("@/dictionaries/zh/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/zh/cellar.json")).default,
    buy: (await import("@/dictionaries/zh/buy.json")).default,
    legal: (await import("@/dictionaries/zh/legal.json")).default,
  }),
  ru: async () => ({
    common: (await import("@/dictionaries/ru/common.json")).default,
    home: (await import("@/dictionaries/ru/home.json")).default,
    domain: (await import("@/dictionaries/ru/domain.json")).default,
    howItWorks: (await import("@/dictionaries/ru/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/ru/cellar.json")).default,
    buy: (await import("@/dictionaries/ru/buy.json")).default,
    legal: (await import("@/dictionaries/ru/legal.json")).default,
  }),
  ja: async () => ({
    common: (await import("@/dictionaries/ja/common.json")).default,
    home: (await import("@/dictionaries/ja/home.json")).default,
    domain: (await import("@/dictionaries/ja/domain.json")).default,
    howItWorks: (await import("@/dictionaries/ja/how-it-works.json")).default,
    cellar: (await import("@/dictionaries/ja/cellar.json")).default,
    buy: (await import("@/dictionaries/ja/buy.json")).default,
    legal: (await import("@/dictionaries/ja/legal.json")).default,
  }),
};

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  loaders[locale]();
