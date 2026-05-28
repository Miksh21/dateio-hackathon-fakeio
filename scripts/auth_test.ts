#!/usr/bin/env -S deno run -A
// auth_test.ts — validate anon key + auth + RLS without real email.
// Mints a session for <email> via the service-key Admin API, then runs the
// queries the UI relies on. Usage: deno run -A scripts/auth_test.ts <email>
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const email = Deno.args[0] ?? "rachel.green@fakeio.eu";
const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

// ensure an auth user exists (created on first real login anyway), then mint a session
const c = await admin.auth.admin.createUser({ email, email_confirm: true });
if (c.error && !/already|registered|exists/i.test(c.error.message)) console.log("createUser:", c.error.message);

const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (link.error) { console.error("generateLink ERROR:", link.error.message); Deno.exit(1); }
const tokenHash = link.data.properties?.hashed_token;
const v = await anon.auth.verifyOtp({ token_hash: tokenHash!, type: "magiclink" });
if (v.error) { console.error("verifyOtp ERROR:", v.error.message); Deno.exit(1); }
console.log(`authed as ${v.data.user?.email}`);

// queries under RLS as this user
const asg = await anon.from("feedback_assignments").select("type").eq("cycle_id", CYCLE);
const byType: Record<string, number> = {};
(asg.data ?? []).forEach((r: { type: string }) => (byType[r.type] = (byType[r.type] ?? 0) + 1));
console.log(`  feedback_assignments visible: ${asg.data?.length ?? 0} ${asg.error ? "ERR " + asg.error.message : JSON.stringify(byType)}`);

const emp = await anon.from("employees").select("id", { count: "exact", head: true });
console.log(`  employees visible (RLS): ${emp.count ?? "?"} ${emp.error ? "ERR " + emp.error.message : ""}`);

const q = await anon.from("questions").select("code").eq("cycle_id", CYCLE);
console.log(`  questions visible: ${q.data?.length ?? 0} ${q.error ? "ERR " + q.error.message : ""}`);

const rpc = await anon.rpc("my_role");
console.log(`  my_role(): ${rpc.data ?? rpc.error?.message}`);

// v_my_assignments (recipient names) + response write-path under RLS
const mine = await anon
  .from("v_my_assignments")
  .select("id,type,status,recipient_first_name,recipient_last_name")
  .limit(3);
console.log(`  v_my_assignments: ${mine.data?.length ?? 0} ${mine.error ? "ERR " + mine.error.message : ""}`);
const a0 = mine.data?.[0] as
  | { id: string; type: string; recipient_first_name: string; recipient_last_name: string }
  | undefined;
if (a0) {
  console.log(`    e.g. ${a0.type} -> ${a0.recipient_first_name} ${a0.recipient_last_name}`);
  const qs = await anon.from("questions").select("id,type,target_assignment_types").eq("cycle_id", CYCLE);
  const tq = (qs.data ?? []).find(
    (q: { type: string; target_assignment_types: string[] }) => q.target_assignment_types?.includes(a0.type),
  ) as { id: string; type: string } | undefined;
  if (tq) {
    const up = await anon.from("responses").upsert(
      {
        assignment_id: a0.id,
        question_id: tq.id,
        scale_value: tq.type.startsWith("scale") ? 4 : null,
        choice_value: tq.type === "multi_choice" ? "4" : null,
        text_value: tq.type === "text" ? "auth_test" : null,
      },
      { onConflict: "assignment_id,question_id" },
    );
    console.log(`  response write (RLS + form_is_open): ${up.error ? "ERR " + up.error.message : "OK"}`);
  }
}
