#!/usr/bin/env -S deno run -A
// Trigger a real OTP email via the configured SMTP. Reports success/error.
import { createClient } from "npm:@supabase/supabase-js@2";
const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false },
});
const email = Deno.args[0] ?? "jan.mikes@dateio.eu";
const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
console.log(error ? `send ERROR: ${error.message}` : `OTP send accepted for ${email} — check the inbox`);
