import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/allowlist";
import { NextResponse, type NextRequest } from "next/server";

// Step 1 of email login: gate the address against the allowlist (server-side, so
// it can't be bypassed from the browser) and, if allowed, ask Supabase Auth to
// email a 6-digit OTP. Email delivery goes out via Supabase's SMTP integration
// (Resend); Supabase owns code generation, expiry and single-use semantics.
//
// The response is ALWAYS the same neutral message — we never reveal whether an
// address is on the allowlist (no account enumeration), and we never surface
// send errors or the code itself.
const NEUTRAL = { message: "If this address is registered, a code has been sent." };

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json(NEUTRAL);
  }

  if (email && isEmailAllowed(email)) {
    const supabase = await createClient();
    // Errors are intentionally swallowed to keep the response neutral.
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  }

  return NextResponse.json(NEUTRAL);
}
