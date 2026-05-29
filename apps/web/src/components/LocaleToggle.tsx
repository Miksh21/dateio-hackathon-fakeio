"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

// Sets the `locale` cookie (read by server components) and refreshes.
export function LocaleToggle({ current, dark = false }: { current: Locale; dark?: boolean }) {
  const router = useRouter();
  const next = current === "en" ? "cs" : "en";
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `locale=${next};path=/;max-age=31536000;samesite=lax`;
        router.refresh();
      }}
      aria-label="Switch language"
      className={
        dark
          ? "rounded-lg px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
          : "rounded-lg px-2 py-1 text-xs font-medium text-ink-600 hover:bg-black/[0.05] hover:text-ink"
      }
    >
      {current === "en" ? "CS" : "EN"}
    </button>
  );
}
