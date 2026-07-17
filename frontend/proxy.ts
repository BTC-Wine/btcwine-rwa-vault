import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, isLocale } from "@/lib/i18n/config";

// Anciens slugs francais -> nouveaux slugs canoniques (anglais, neutres pour
// toutes les locales). Assure la continuite des liens deja partages.
const legacySlugs: Record<string, string> = {
  cave: "cellar",
  cgv: "terms",
  "comment-ca-marche": "how-it-works",
  confidentialite: "privacy",
  domaine: "domain",
  "mentions-legales": "legal",
};

function renameLegacy(segments: string[]): { changed: boolean; segments: string[] } {
  let changed = false;
  const out = segments.map((seg) => {
    if (legacySlugs[seg]) {
      changed = true;
      return legacySlugs[seg];
    }
    return seg;
  });
  return { changed, segments: out };
}

// Choisit la locale : cookie explicite, sinon Accept-Language, sinon defaut.
function detectLocale(request: NextRequest): string {
  const cookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && isLocale(cookie)) return cookie;

  const header = request.headers.get("accept-language");
  if (header) {
    const wanted = header
      .split(",")
      .map((part) => {
        const [tag, q] = part.trim().split(";q=");
        return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);
    for (const { tag } of wanted) {
      const base = tag.split("-")[0];
      const match = locales.find((l) => l === tag || l === base);
      if (match) return match;
    }
  }
  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/"); // ["", maybe-locale, ...rest]

  const hasLocale = segments.length > 1 && isLocale(segments[1]);

  if (hasLocale) {
    // Locale presente : on ne corrige que d'eventuels anciens slugs.
    const { changed, segments: renamed } = renameLegacy(segments);
    if (changed) {
      request.nextUrl.pathname = renamed.join("/");
      return NextResponse.redirect(request.nextUrl);
    }
    return NextResponse.next();
  }

  // Pas de locale : on renomme les anciens slugs puis on prefixe la locale.
  const { segments: renamed } = renameLegacy(segments);
  const locale = detectLocale(request);
  const rest = renamed.slice(1).join("/");
  request.nextUrl.pathname = `/${locale}${rest ? `/${rest}` : ""}`;

  const response = NextResponse.redirect(request.nextUrl);
  response.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // Exclut _next, l'API et tout chemin contenant un point (fichiers statiques).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
