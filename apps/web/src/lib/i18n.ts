export type Locale = "en" | "cs";
export const LOCALES: Locale[] = ["en", "cs"];
export const DEFAULT_LOCALE: Locale = "en";

/** Localized question text. `text` is English (primary); `text_cs` is Czech. */
export function qText(row: { text: string; text_cs: string | null }, locale: Locale): string {
  return locale === "cs" ? row.text_cs ?? row.text : row.text;
}

/** Localized option label from a {value, en, cs} option object. */
export function optLabel(o: { en: string; cs: string | null }, locale: Locale): string {
  return locale === "cs" ? o.cs ?? o.en : o.en;
}

/** UI chrome strings. Extend as screens are built. */
export const dict = {
  en: {
    appName: "360° Feedback",
    tagline: "Honest, anonymous, useful feedback.",
    login: "Log in",
    emailLabel: "Work email",
    sendCode: "Send code",
    codeLabel: "6-digit code",
    verify: "Verify & continue",
    checkEmail: "We emailed a 6-digit code to",
    resendCode: "Resend code",
    codeResent: "New code sent.",
    differentEmail: "Use a different email",
    signOut: "Sign out",
    myForms: "My forms",
    admin: "Admin",
    results: "Results",
    notAllowedDomain: "That email domain isn't allowed.",
    notInDirectory: "This email isn't in the employee directory.",
    loading: "Loading…",
    save: "Save",
    saved: "Saved",
    submit: "Submit",
  },
  cs: {
    appName: "360° Zpětná vazba",
    tagline: "Upřímná, anonymní a užitečná zpětná vazba.",
    login: "Přihlásit se",
    emailLabel: "Pracovní e-mail",
    sendCode: "Odeslat kód",
    codeLabel: "6místný kód",
    verify: "Ověřit a pokračovat",
    checkEmail: "Poslali jsme 6místný kód na",
    resendCode: "Poslat kód znovu",
    codeResent: "Nový kód odeslán.",
    differentEmail: "Použít jiný e-mail",
    signOut: "Odhlásit se",
    myForms: "Moje formuláře",
    admin: "Administrace",
    results: "Výsledky",
    notAllowedDomain: "Tato e-mailová doména není povolena.",
    notInDirectory: "Tento e-mail není v adresáři zaměstnanců.",
    loading: "Načítání…",
    save: "Uložit",
    saved: "Uloženo",
    submit: "Odeslat",
  },
} as const;

export type UIKey = keyof typeof dict["en"];
export function tr(locale: Locale, key: UIKey): string {
  return dict[locale][key];
}
