"use client";

import { historique, htFromTTC, prixActuels, prixParPays } from "@/lib/domaine";
import { useT } from "./I18nProvider";

// Couleur de serie validee (contraste et vision des couleurs) sur le fond
// creme #faf7f2.
const SERIE = "#8a3548";

export function CountryPriceBars() {
  const t = useT("home");
  const max = Math.max(...prixParPays.map((p) => p.prix));
  return (
    <div>
      <h3 className="font-serif text-xl text-[#5a1f2b]">
        {t("chart.countryTitle")}
      </h3>
      <p className="mt-1 text-sm text-stone-500">
        {t("chart.countrySubtitle")}
      </p>
      <ul className="mt-4 space-y-2">
        {prixParPays.map((p) => (
          <li key={p.paysKey} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-stone-600">{t("countries." + p.paysKey)}</span>
            <span
              className="h-3 rounded"
              style={{ width: `${(p.prix / max) * 100 * 0.8}%`, background: SERIE }}
            />
            <span className="shrink-0 whitespace-nowrap tabular-nums text-stone-800">
              {p.prix} €
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-stone-500">
        {t("chart.countrySource")}
      </p>
    </div>
  );
}

export function PriceStats() {
  const t = useT("home");
  const releves = historique.filter((h) => h.releveTTC !== null).map((h) => h.releveTTC as number);
  const releveMin = Math.min(...releves);
  const releveMax = Math.max(...releves);
  const releveMaxHT = htFromTTC(releveMax);
  const tiles = [
    {
      label: t("chart.tileYourPreorderLabel"),
      value: t("chart.tileYourPreorderValue"),
      note: t("chart.tileYourPreorderNote"),
    },
    {
      label: t("chart.tileEstateLabel"),
      value: `${prixActuels.proprieteB2C} €`,
      note: t("chart.tileEstateNote"),
    },
    {
      label: t("chart.tileOfficialLabel"),
      value: `${prixActuels.distributeurB2C} €`,
      note: t("chart.tileOfficialNote"),
    },
    {
      label: t("chart.tileDistributorsLabel"),
      value: t("chart.tileDistributorsValue", { min: releveMin, max: releveMax }),
      note: t("chart.tileDistributorsNote", {
        minHT: htFromTTC(releveMin),
        maxHT: htFromTTC(releveMax),
      }),
    },
  ];
  // progression hors taxes entre chaque etape, du prix de precommande au prix
  // le plus eleve constate chez les distributeurs (valeur haute a chaque fois)
  const etapes = [prixActuels.precommande, prixActuels.proprieteB2C, prixActuels.distributeurB2C, releveMaxHT];
  const pcts = etapes.slice(1).map((v, i) => Math.round((v / etapes[i] - 1) * 100));
  const totalPct = Math.round((releveMaxHT / prixActuels.precommande - 1) * 100);

  return (
    <div>
    <div className="relative lg:pb-11 lg:pt-9">
      {/* petits ponts au-dessus des espaces entre tuiles, pourcentage au sommet */}
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-9 lg:block">
        <svg
          className="h-full w-full"
          viewBox="0 0 400 36"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          {pcts.map((_, i) => (
            <path
              key={i}
              d={`M ${93 + i * 100} 34 Q ${100 + i * 100} 10 ${107 + i * 100} 34`}
              stroke="#5a1f2b"
              strokeWidth="1.5"
              opacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {pcts.map((p, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#5a1f2b] px-2 py-0.5 text-[10px] font-medium text-white ring-4 ring-[#faf7f2]"
            style={{ left: `${25 + i * 25}%`, top: "22px" }}
            title={t("chart.stepTitle")}
          >
            +{p} %
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm text-stone-500">{t.label}</p>
            <p className="mt-1 font-serif text-2xl text-[#5a1f2b]">{t.value}</p>
            <p className="mt-0.5 text-xs text-stone-500">{t.note}</p>
          </div>
        ))}
      </div>

      {/* le pont total, du premier au dernier prix, sous les tuiles */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-10 lg:block">
        <svg
          className="h-full w-full"
          viewBox="0 0 400 40"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M 50 2 Q 200 46 350 2"
            stroke="#5a1f2b"
            strokeWidth="1.5"
            opacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#5a1f2b] px-2 py-0.5 text-[10px] font-medium text-white ring-4 ring-[#faf7f2]"
          style={{ top: "24px" }}
          title={t("chart.totalTitle")}
        >
          {t("chart.totalPct", { pct: totalPct })}
        </span>
      </div>
    </div>
    <p className="mt-6 text-xs text-stone-500">
      {t("chart.note")}
    </p>
    </div>
  );
}
