"use client";

import { LocaleLink } from "./LocaleLink";
import { useT } from "./I18nProvider";

export function Footer() {
  const t = useT("common");

  const links = [
    { href: "/#cuvees", label: t("nav.cuvees") },
    { href: "/domain", label: t("nav.domains") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/legal", label: t("footer.legalNotice") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/privacy", label: t("footer.privacy") },
  ];

  return (
    <footer className="mt-16 border-t border-stone-200 bg-white/60">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <p className="font-serif text-xl text-[#5a1f2b]">TERWA</p>
            <p className="mt-1 max-w-xs text-sm text-stone-500">
              {t("footer.tagline")}
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-stone-600">
            {links.map((l) => (
              <LocaleLink key={l.href} href={l.href} className="py-1 hover:text-[#5a1f2b]">
                {l.label}
              </LocaleLink>
            ))}
            <a href="mailto:contact@terwa.io" className="py-1 hover:text-[#5a1f2b]">
              {t("footer.contact")}
            </a>
          </nav>
        </div>
        <div className="mt-8 border-t border-stone-100 pt-6 text-center text-xs text-stone-500">
          <p className="font-medium">{t("footer.alcohol1")}</p>
          <p className="mt-1">{t("footer.alcohol2")}</p>
          <p className="mt-3 text-stone-400">{t("footer.network")}</p>
        </div>
      </div>
    </footer>
  );
}
