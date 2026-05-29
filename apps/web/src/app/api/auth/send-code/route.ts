import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Step 1 of email login: gate the address SERVER-SIDE, then (if allowed) ask
// Supabase Auth to email a 6-digit OTP. The gate is the can_login() RPC — the
// live employee directory — so it never drifts from the data and there's no
// hardcoded list to maintain.
//
// The response is ALWAYS this same neutral message: we never reveal whether an
// address is a known employee (no account enumeration), and we never surface
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

  if (email) {
    const supabase = await createClient();
    const { data: allowed } = await supabase.rpc("can_login", { p_email: email });
    if (allowed) {
      // Gated by can_login (a real employee), so shouldCreateUser is safe: it
      // lets an employee without a prior auth row sign in, and can't mint orphan
      // users for non-employees (they never pass the gate). Errors are
      // intentionally swallowed to keep the response neutral.
      await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    }
  }

  return NextResponse.json(NEUTRAL);
}
