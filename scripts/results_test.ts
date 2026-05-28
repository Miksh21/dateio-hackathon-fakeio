#!/usr/bin/env -S deno run -A
// results_test.ts — verify v_received_aggregated / v_received_text_anon visibility
// + anonymity threshold for a viewer looking at a recipient.
//   deno run -A scripts/results_test.ts <viewerEmail> [recipientEmail=viewer]
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const viewer = Deno.args[0];
const recipientEmail = Deno.args[1] ?? viewer;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const { data: rec } = await admin
  .from("employees")
  .select("id,first_name,last_name")
  .ilike("email", recipientEmail)
  .maybeSingle();
if (!rec) { console.error(`recipient ${recipientEmail} not found`); Deno.exit(1); }

await admin.auth.admin.createUser({ email: viewer, email_confirm: true }).catch(() => {});
const link = await admin.auth.admin.generateLink({ type: "magiclink", email: viewer });
const v = await anon.auth.verifyOtp({ token_hash: link.data!.properties!.hashed_token, type: "magiclink" });
if (v.error) { console.error("auth:", v.error.message); Deno.exit(1); }

const agg = await anon.from("v_received_aggregated").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", rec.id);
const txt = await anon.from("v_received_text_anon").select("response_id").eq("cycle_id", CYCLE).eq("recipient_id", rec.id);
console.log(`viewer=${viewer}  recipient=${rec.first_name} ${rec.last_name}: agg=${agg.data?.length ?? 0} rows, text=${txt.data?.length ?? 0} ${agg.error ? "ERR " + agg.error.message : ""}`);
if (agg.data?.[0]) console.log(`   sample avg=${agg.data[0].avg_scale} (${agg.data[0].response_count} responses)`);
