"use client";

import { useT } from "./I18nProvider";

export function TestBanner() {
  const t = useT("common");
  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 sm:text-sm"
    >
      {t("testBanner.message")}
    </div>
  );
}
