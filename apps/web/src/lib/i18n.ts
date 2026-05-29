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
    report: "Report",
    home: "Home",
    hi: "Hi",
    notAllowedDomain: "That email domain isn't allowed.",
    notInDirectory: "This email isn't in the employee directory.",
    invalidCode: "Invalid or expired code. Please try again.",
    loading: "Loading…",
    save: "Save",
    saved: "Saved",
    submit: "Submit",
    chat: "Chat",
    chatTitle: "Chat with your feedback",
    chatSubtitle: "Ask about feedback you're allowed to see — your own, your team's, and your peers'.",
    chatPlaceholder: "Ask a question about your feedback…",
    chatSend: "Send",
    chatThinking: "Thinking…",
    chatEmptyTitle: "Ask your first question",
    chatEmptyHint: "e.g. \"What are my strengths and where can I improve?\"",
    chatDisclaimer: "Answers are anonymized and limited to feedback you're entitled to see. The assistant never reveals who gave feedback.",
    chatError: "Something went wrong. Please try again.",
    chatSources: "sources",
    // Matching review
    matching: "Matching",
    matchingReviewTitle: "Review the matching",
    matchingReviewSubtitle: "Confirm who reviews whom for your team before feedback collection starts.",
    matchingNoReview: "Nothing to review",
    matchingNoReviewHint: "There is no matching awaiting your review right now.",
    matchingReviews: "Reviewed by",
    matchingReviewing: "Will review",
    matchingGiven: "Gives",
    matchingReceived: "Receives",
    matchingFloorMet: "4 / 4 minimum met",
    matchingApprove: "Approve",
    matchingRequestChanges: "Request changes",
    matchingNotePlaceholder: "Optional note for the admin…",
    matchingApproved: "Approved",
    matchingChangesRequested: "Changes requested",
    matchingPending: "Awaiting your decision",
    matchingDecisionSaved: "Decision saved",
    matchingYourDecision: "Your decision",
    // Admin matching panel
    matchingAdminTitle: "Matching review",
    matchingCoverage: "Coverage (min. 4 give / 4 receive)",
    matchingCoverageOk: "Everyone meets the 4 / 4 minimum.",
    matchingCoverageBelow: "Below the minimum",
    matchingProposeForApproval: "Propose for approval",
    matchingProposeHint: "Generate first, then send to managers once coverage is 4 / 4.",
    matchingApprovalProgress: "Manager approvals",
    matchingActivate: "Activate matching",
    matchingActivateHint: "Enabled once every manager has approved.",
    matchingStatusDraft: "Draft — not yet proposed",
    matchingStatusInReview: "In review — awaiting manager approvals",
    matchingStatusApproved: "Approved — ready to activate",
    matchingStatusActive: "Active — matching is live",
    matchingManagersApproved: "managers approved",
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
    report: "Přehled",
    home: "Domů",
    hi: "Ahoj",
    notAllowedDomain: "Tato e-mailová doména není povolena.",
    notInDirectory: "Tento e-mail není v adresáři zaměstnanců.",
    invalidCode: "Neplatný nebo vypršelý kód. Zkuste to prosím znovu.",
    loading: "Načítání…",
    save: "Uložit",
    saved: "Uloženo",
    submit: "Odeslat",
    chat: "Chat",
    chatTitle: "Chat s vaší zpětnou vazbou",
    chatSubtitle: "Ptejte se na zpětnou vazbu, kterou smíte vidět — svou vlastní, svého týmu a svých kolegů.",
    chatPlaceholder: "Zeptejte se na svou zpětnou vazbu…",
    chatSend: "Odeslat",
    chatThinking: "Přemýšlím…",
    chatEmptyTitle: "Položte první otázku",
    chatEmptyHint: "např. „Jaké jsou mé silné stránky a kde se mohu zlepšit?“",
    chatDisclaimer: "Odpovědi jsou anonymizované a omezené na zpětnou vazbu, kterou smíte vidět. Asistent nikdy neprozradí, kdo zpětnou vazbu napsal.",
    chatError: "Něco se pokazilo. Zkuste to prosím znovu.",
    chatSources: "zdrojů",
    // Matching review
    matching: "Párování",
    matchingReviewTitle: "Zkontrolujte párování",
    matchingReviewSubtitle: "Před zahájením sběru potvrďte, kdo koho ve vašem týmu hodnotí.",
    matchingNoReview: "Není co kontrolovat",
    matchingNoReviewHint: "Aktuálně nečeká žádné párování na vaši kontrolu.",
    matchingReviews: "Hodnotí ho",
    matchingReviewing: "Bude hodnotit",
    matchingGiven: "Dává",
    matchingReceived: "Přijímá",
    matchingFloorMet: "Splněno minimum 4 / 4",
    matchingApprove: "Schválit",
    matchingRequestChanges: "Požádat o změny",
    matchingNotePlaceholder: "Nepovinná poznámka pro administrátora…",
    matchingApproved: "Schváleno",
    matchingChangesRequested: "Vyžádány změny",
    matchingPending: "Čeká na vaše rozhodnutí",
    matchingDecisionSaved: "Rozhodnutí uloženo",
    matchingYourDecision: "Vaše rozhodnutí",
    // Admin matching panel
    matchingAdminTitle: "Kontrola párování",
    matchingCoverage: "Pokrytí (min. 4 dát / 4 přijmout)",
    matchingCoverageOk: "Všichni splňují minimum 4 / 4.",
    matchingCoverageBelow: "Pod minimem",
    matchingProposeForApproval: "Předložit ke schválení",
    matchingProposeHint: "Nejprve vygenerujte, poté při pokrytí 4 / 4 odešlete manažerům.",
    matchingApprovalProgress: "Schválení manažerů",
    matchingActivate: "Aktivovat párování",
    matchingActivateHint: "Povolí se, jakmile schválí všichni manažeři.",
    matchingStatusDraft: "Koncept — zatím nepředloženo",
    matchingStatusInReview: "V kontrole — čeká na schválení manažery",
    matchingStatusApproved: "Schváleno — připraveno k aktivaci",
    matchingStatusActive: "Aktivní — párování je živé",
    matchingManagersApproved: "manažerů schválilo",
  },
} as const;

export type UIKey = keyof typeof dict["en"];
export function tr(locale: Locale, key: UIKey): string {
  return dict[locale][key];
}

/** Friendly bilingual label for a feedback assignment type. */
export function assignmentTypeLabel(type: string, locale: Locale): string {
  const m: Record<string, [string, string]> = {
    self: ["Self-evaluation", "Sebehodnocení"],
    upward: ["Upward", "Nadřízený"],
    downward: ["Downward", "Podřízený"],
    peer: ["Peer", "Kolega"],
  };
  const e = m[type];
  return e ? (locale === "cs" ? e[1] : e[0]) : type;
}

/** Friendly bilingual label for an assignment status. */
export function statusLabel(status: string, locale: Locale): string {
  const m: Record<string, [string, string]> = {
    pending: ["To do", "K vyplnění"],
    draft: ["In progress", "Rozpracováno"],
    submitted: ["Submitted", "Odesláno"],
  };
  const e = m[status];
  return e ? (locale === "cs" ? e[1] : e[0]) : status;
}
