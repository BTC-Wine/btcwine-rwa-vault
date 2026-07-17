"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  locales,
  localeNames,
  localeFlags,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import { useLocale } from "./I18nProvider";

// Selecteur de langue : drapeau seul (sans contour) + chevron. Le choix
// remplace le segment de locale dans l'URL et se memorise dans un cookie
// (lu par le proxy pour les visites suivantes).
export function LanguageSwitcher() {
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // fermeture au clic exterieur
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function select(next: Locale) {
    setOpen(false);
    if (next === current) return;
    const segments = pathname.split("/");
    // segments[0] = "" , segments[1] = locale courante
    if (segments.length > 1 && isLocale(segments[1])) {
      segments[1] = next;
    } else {
      segments.splice(1, 0, next);
    }
    const nextPath = segments.join("/") || `/${next}`;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.push(nextPath));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Language: ${localeNames[current]}`}
        className="flex min-h-11 items-center gap-1 px-1 text-xl leading-none"
      >
        <span aria-hidden>{localeFlags[current]}</span>
        <svg
          className={`h-3 w-3 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Language"
          className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          {locales.map((l) => (
            <li key={l} role="option" aria-selected={l === current}>
              <button
                onClick={() => select(l)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-stone-50 ${
                  l === current ? "text-[#5a1f2b]" : "text-stone-700"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {localeFlags[l]}
                </span>
                {localeNames[l]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
