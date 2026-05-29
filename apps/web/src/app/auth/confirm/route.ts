import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Magic-link / OTP confirmation: exchanges a Supabase token_hash for a session
// (sets the auth cookies via the server client) and redirects in. Used by
// emailed magic links and by admin-generated one-click login links.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as
    | "email"
    | "magiclink"
    | "recovery"
    | "invite"
    | "signup"
    | "email_change";
  const next = searchParams.get("next") ?? "/";

  if (token_hash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
}
