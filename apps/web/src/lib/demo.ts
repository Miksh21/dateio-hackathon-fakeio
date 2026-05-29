// Demo fallback config. DEMO_MODE = true shows the user-picker login (sign in as
// any listed person without email) and a "DEMO" badge in the header.
//
// ⚠️ This grants anyone with the URL access as these accounts. To LOCK DOWN after
// the demo: set DEMO_MODE = false (redeploy) AND rotate the password on these
// Supabase auth users. Demo only — not for production.

export type DemoUser = {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  division: string | null;
  is_super_admin: boolean;
};

export const DEMO_MODE = true;

// Shared password set on these accounts (see scripts/set_demo_pw). Demo only.
export const DEMO_PASSWORD = "DemoFakeio360!";

export const DEMO_USERS: DemoUser[] = [
  { email: "jitka.bartonikova@dateio.eu", first_name: "Jitka", last_name: "Bartoníková", role: "manager", division: "Management", is_super_admin: true },
  { email: "michaela.fialova@dateio.eu", first_name: "Michaela", last_name: "Fialová", role: "manager", division: "Management", is_super_admin: true },
  { email: "lenka.vicenikova@dateio.eu", first_name: "Lenka", last_name: "Viceníková", role: "manager", division: "Management", is_super_admin: true },
  { email: "vojtech.sladecek@dateio.eu", first_name: "Vojtěch", last_name: "Sládeček", role: "ic", division: "RevOps", is_super_admin: false },
  { email: "vojtech.rabyniuk@tapix.io", first_name: "Vojtěch", last_name: "Rabyniuk", role: "ic", division: "RevOps", is_super_admin: false },
  { email: "jan.mikes@dateio.eu", first_name: "Jan", last_name: "Mikeš", role: "ic", division: "RevOps", is_super_admin: false },
];
