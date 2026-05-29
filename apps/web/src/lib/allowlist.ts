// Login allowlist — the single source of truth for who may request a login code.
//
// For now this is an explicit list of permitted addresses. It is designed to
// later become domain-based (@dateio.eu, @tapix.io): when that day comes, switch
// `isEmailAllowed` to use `ALLOWED_DOMAINS` (one-line change) and drop the list.

export const ALLOWED_EMAILS = [
  "steve.jobs@dateio.eu", // CEO
  "neo.anderson@dateio.eu", // MNG
  "trinity.matrix@dateio.eu", // Peer
  "morpheus.zion@dateio.eu", // Peer
  "oracle.smith@dateio.eu", // Peer
  "vojtech.sladecek@dateio.eu", // Peer
  "jan.mikes@dateio.eu", // Peer
  "lenka.vicenikova@dateio.eu", // MNG
] as const;

// Domains that will gate logins once we switch off the explicit list above.
// Not yet enforced — kept here so the future migration is a one-liner.
export const ALLOWED_DOMAINS = ["dateio.eu", "tapix.io"] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_EMAILS.map((e) => e.toLowerCase()));

/** True if `email` is permitted to request a login code. Case-insensitive. */
export function isEmailAllowed(email: string): boolean {
  return ALLOWED_SET.has(email.trim().toLowerCase());
}
