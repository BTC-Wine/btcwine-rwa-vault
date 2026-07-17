"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "@/lib/i18n/config";
import { makeT, type Messages } from "@/lib/i18n/translate";

type I18nValue = {
  locale: Locale;
  dict: Record<string, Messages>;
};

const Ctx = createContext<I18nValue | null>(null);

// Fournit le dictionnaire (charge cote serveur) aux composants client. Le
// layout serveur passe le dict et la locale ; les composants client lisent via
// useT(namespace) ou useLocale().
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Record<string, Messages>;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useT/useLocale must be used inside I18nProvider");
  return ctx;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

// Retourne une fonction t(key, vars?) liee au namespace demande.
export function useT(namespace: string) {
  const { dict } = useI18n();
  return useMemo(() => makeT(dict, namespace), [dict, namespace]);
}
