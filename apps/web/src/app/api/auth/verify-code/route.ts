import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Step 2 of email login: verify the 6-digit code. On success Supabase mints a
// real session and the SSR client writes the auth cookies onto this response, so
// the rest of the app (RLS-gated pages) sees the signed-in user. Codes are
// single-use and expiry-checked by Supabase.
//
// Defense in depth: re-check can_login before spending a verification. Any
// failure returns a generic 401 — no enumeration, no detail leakage.
const INVALID = { error: "Invalid or expired code." };

export async function POST(request: NextRequest) {
  let email = "";
  let code = "";
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim() : "";
    code = typeof body?.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json(INVALID, { status: 401 });
  }

  if (!email || !code) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_login", { p_email: email });
  if (!allowed) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
