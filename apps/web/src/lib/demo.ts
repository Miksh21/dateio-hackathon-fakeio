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

// Fallback shown only if the live demo_roster() RPC is slow/unavailable. Kept in
// sync with demo_roster() (the 5 @dateio.eu demo personas + admins) so the picker
// never flashes stale names. Ordered admins-first, then by last name — same as the RPC.
export const DEMO_USERS: DemoUser[] = [
  { email: "rachel.green@fakeio.eu", first_name: "Rachel", last_name: "Green", role: "manager", division: "People", is_super_admin: true },
  { email: "jan.mikes21@gmail.com", first_name: "Jan", last_name: "Mikeš", role: "manager", division: "Management", is_super_admin: true },
  { email: "vsladecek1@gmail.com", first_name: "Vojtěch", last_name: "Sládeček", role: "ic", division: "People", is_super_admin: true },
  { email: "neo.anderson@dateio.eu", first_name: "Neo", last_name: "Anderson", role: "manager", division: "Data - infra", is_super_admin: false },
  { email: "steve.jobs@dateio.eu", first_name: "Steve", last_name: "Jobs", role: "ceo", division: "Management", is_super_admin: false },
  { email: "trinity.matrix@dateio.eu", first_name: "Trinity", last_name: "Matrix", role: "ic", division: "Data - infra", is_super_admin: false },
  { email: "oracle.smith@dateio.eu", first_name: "Oracle", last_name: "Smith", role: "ic", division: "Data - infra", is_super_admin: false },
  { email: "morpheus.zion@dateio.eu", first_name: "Morpheus", last_name: "Zion", role: "ic", division: "Data - infra", is_super_admin: false },
];
