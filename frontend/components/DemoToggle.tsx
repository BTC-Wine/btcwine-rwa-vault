"use client";

import { useEffect, useState } from "react";
import { isDemo, toggleDemo } from "@/lib/demo";
import { useT } from "./I18nProvider";

// Bouton TEMPORAIRE de revue UX. A retirer avant le mainnet.
export function DemoToggle() {
  const t = useT("common");
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isDemo()), []);

  return (
    <button
      onClick={toggleDemo}
      className={`fixed bottom-4 right-4 z-50 rounded-full border px-4 py-2 text-xs shadow-sm ${
        on
          ? "border-[#5a1f2b] bg-[#5a1f2b] text-white"
          : "border-stone-300 bg-white text-stone-500 hover:text-[#5a1f2b]"
      }`}
      title={t("demo.title")}
    >
      {t("demo.label")} : {on ? t("demo.on") : t("demo.off")}
    </button>
  );
}
