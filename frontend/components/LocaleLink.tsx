"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "./I18nProvider";

// Lien interne conscient de la locale : prefixe automatiquement le href par la
// locale courante (/domain -> /en/domain, /#cuvees -> /en#cuvees). Les liens
// externes (http, mailto, tel) et les ancres pures (#...) passent tels quels.
export function localeHref(locale: string, href: string): string {
  if (/^([a-z]+:|\/\/)/i.test(href) || href.startsWith("#")) return href;
  if (!href.startsWith("/")) return href;
  return `/${locale}${href === "/" ? "" : href}`;
}

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function LocaleLink({ href, ...props }: Props) {
  const locale = useLocale();
  return <Link href={localeHref(locale, href)} {...props} />;
}
