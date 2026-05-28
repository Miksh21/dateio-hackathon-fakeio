#!/usr/bin/env -S deno run -A
// run-sql.ts — execute a .sql file against SUPABASE_DB_URL (Supabase pooler).
// Surfaces RAISE NOTICE messages; exits non-zero on error.
//   SUPABASE_DB_URL=... deno run -A scripts/run-sql.ts <file.sql>
import pg from "npm:pg@8";

const file = Deno.args[0];
const rawUrl = Deno.env.get("SUPABASE_DB_URL");
if (!file || !rawUrl) {
  console.error("usage: SUPABASE_DB_URL=... deno run -A scripts/run-sql.ts <file.sql>");
  Deno.exit(2);
}
const connectionString = rawUrl.replace(/\?.*$/, ""); // drop ?sslmode=...; ssl set below
const sql = await Deno.readTextFile(file);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
client.on("notice", (n: { message?: string }) => console.log("NOTICE:", n.message ?? ""));
await client.connect();
try {
  await client.query(sql);
  console.log(`OK — applied ${file}`);
} catch (e) {
  console.error(`ERROR in ${file}: ${(e as Error).message}`);
  Deno.exitCode = 1;
} finally {
  await client.end();
}
