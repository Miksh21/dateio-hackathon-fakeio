#!/usr/bin/env -S deno run -A
// magic_link.ts — generate one-click login links (no email, no rate limit) via
// the Admin API. Open the link → /auth/confirm exchanges the token → logged in.
//   deno run -A scripts/magic_link.ts <email> [host ...]
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const email = Deno.args[0] ?? "jan.mikes@dateio.eu";
const hosts =
  Deno.args.length > 1
    ? Deno.args.slice(1)
    : ["http://localhost:3000", "https://dateio-hackathon-fakeio.vercel.app"];

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});

const g = await admin.auth.admin.generateLink({ type: "magiclink", email });
const th = g.data?.properties?.hashed_token;
if (!th) {
  console.error("could not generate link:", g.error?.message);
  Deno.exit(1);
}
console.log(`one-click login for ${email} (valid ~1h, one use):`);
for (const h of hosts) {
  console.log(`  ${h.replace(/\/$/, "")}/auth/confirm?token_hash=${th}&type=magiclink`);
}
