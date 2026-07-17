"use client";

import { useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LocaleLink } from "./LocaleLink";
import { useT } from "./I18nProvider";
import { useWallet } from "./WalletProvider";

const LIENS = [
  { href: "/#cuvees", key: "nav.cuvees" },
  { href: "/domain", key: "nav.domains" },
  { href: "/how-it-works", key: "nav.howItWorks" },
  { href: "/cellar", key: "nav.cellar" },
];

function short(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function Header() {
  const t = useT("common");
  const { address, connect, disconnect, connecting } = useWallet();
  const [open, setOpen] = useState(false);

  const walletButton = (compact: boolean) =>
    address ? (
      <button
        onClick={disconnect}
        className="min-h-11 whitespace-nowrap rounded-full border border-stone-300 px-4 py-2 font-mono text-xs hover:border-[#5a1f2b]"
        title={t("wallet.disconnectTitle")}
      >
        {short(address)}
      </button>
    ) : (
      <button
        onClick={connect}
        disabled={connecting}
        className={`min-h-11 whitespace-nowrap rounded-full bg-[#5a1f2b] py-2 text-white hover:bg-[#71303e] disabled:opacity-50 ${compact ? "px-4 text-sm" : "px-5"}`}
      >
        {connecting
          ? t("wallet.connecting")
          : compact
            ? t("wallet.connectShort")
            : t("wallet.connect")}
      </button>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#faf7f2]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <LocaleLink
          href="/"
          className="py-2 font-serif text-xl tracking-wide text-[#5a1f2b] sm:text-2xl"
        >
          TERWA
        </LocaleLink>

        {/* navigation desktop */}
        <nav className="hidden items-center gap-x-1 text-sm text-stone-700 md:flex">
          {LIENS.map((l) => (
            <LocaleLink
              key={l.href}
              href={l.href}
              className="whitespace-nowrap px-3 py-3 hover:text-[#5a1f2b]"
            >
              {t(l.key)}
            </LocaleLink>
          ))}
          <span className="ml-2">{walletButton(false)}</span>
          <span className="ml-1">
            <LanguageSwitcher />
          </span>
        </nav>

        {/* controles mobiles : wallet compact + burger */}
        <div className="flex items-center gap-2 md:hidden">
          {walletButton(true)}
          <LanguageSwitcher />
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? t("menu.close") : t("menu.open")}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 text-[#5a1f2b]"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* menu deroulant mobile */}
      {open && (
        <nav className="border-t border-stone-200 bg-[#faf7f2] md:hidden">
          {LIENS.map((l) => (
            <LocaleLink
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block border-b border-stone-100 px-6 py-4 text-stone-700 hover:text-[#5a1f2b]"
            >
              {t(l.key)}
            </LocaleLink>
          ))}
        </nav>
      )}
    </header>
  );
}
