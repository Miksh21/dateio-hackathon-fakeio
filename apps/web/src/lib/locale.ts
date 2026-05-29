import { cookies } from "next/headers";
import type { Locale } from "./i18n";

// Server-side current locale, from the `locale` cookie set by the header toggle.
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  return c.get("locale")?.value === "cs" ? "cs" : "en";
}
