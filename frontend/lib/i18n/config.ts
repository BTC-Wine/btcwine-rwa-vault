// Locales servies par le site. `en` est la langue par defaut (produit
// international). L'ordre ici est l'ordre d'affichage dans le selecteur.
export const locales = ["en", "fr", "de", "zh", "ru", "ja"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Nom de chaque langue dans sa propre langue, pour le selecteur.
export const localeNames: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  zh: "简体中文",
  ru: "Русский",
  ja: "日本語",
};

// Drapeau affiche dans le selecteur de langue.
export const localeFlags: Record<Locale, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  de: "🇩🇪",
  zh: "🇨🇳",
  ru: "🇷🇺",
  ja: "🇯🇵",
};

// Attribut lang de la balise html (BCP 47).
export const htmlLang: Record<Locale, string> = {
  en: "en",
  fr: "fr",
  de: "de",
  zh: "zh-Hans",
  ru: "ru",
  ja: "ja",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
