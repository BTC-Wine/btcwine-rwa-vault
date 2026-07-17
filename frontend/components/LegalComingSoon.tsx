import { getT } from "@/lib/i18n/server";

// Page d'attente des documents legaux : publies une fois valides par le
// conseil juridique. Les brouillons restent dans l'historique git.
export async function LegalComingSoon({
  lang,
  titleKey,
}: {
  lang: string;
  titleKey: string;
}) {
  const t = await getT(lang, "legal");
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-stone-500">
        {t("comingSoon.badge")}
      </span>
      <h1 className="mt-5 font-serif text-4xl text-[#5a1f2b]">{t(titleKey)}</h1>
      <p className="mt-4 text-stone-600">{t("comingSoon.body")}</p>
      <p className="mt-6 text-sm text-stone-500">
        {t("comingSoon.contact")}{" "}
        <a href="mailto:contact@terwa.io" className="underline hover:text-[#5a1f2b]">
          contact@terwa.io
        </a>
      </p>
    </div>
  );
}
