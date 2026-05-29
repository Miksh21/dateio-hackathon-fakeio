import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/allowlist";
import { NextResponse, type NextRequest } from "next/server";

// Step 2 of email login: verify the 6-digit code. On success Supabase mints a
// real session and the SSR client writes the auth cookies onto this response, so
// the rest of the app (RLS-gated pages) sees the signed-in user. Codes are
// single-use and expiry-checked by Supabase. Failures return a generic 401.
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

  // Defense in depth: re-check the allowlist before spending a verification.
  if (!email || !code || !isEmailAllowed(email)) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
