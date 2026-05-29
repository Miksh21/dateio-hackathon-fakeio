#!/usr/bin/env -S deno run -A
// login_code.ts — mint a login OTP code via the Admin API (bypasses the email
// send rate limit; no email is sent). Verifies the code path, then prints a
// fresh unconsumed code to type into the login UI.
//   deno run -A scripts/login_code.ts <email>
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const email = Deno.args[0] ?? "jan.mikes@dateio.eu";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});

// test the exact UI path (verifyOtp type 'email') — this consumes the test code
const t = await admin.auth.admin.generateLink({ type: "magiclink", email });
const v = await anon.auth.verifyOtp({ email, token: t.data!.properties!.email_otp!, type: "email" });

// fresh, unconsumed code for the user
const g = await admin.auth.admin.generateLink({ type: "magiclink", email });

console.log("email:", email);
console.log("UI code path (verifyOtp type=email) works:", !v.error, v.error?.message ?? "");
console.log("➡️  LOGIN CODE to type in the UI:", g.data!.properties!.email_otp);
