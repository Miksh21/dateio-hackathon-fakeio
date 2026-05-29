import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// DEMO-ONLY fallback: sign in as any known employee without email/OTP.
// Gated by DEMO_LOGIN=1 AND the server-only service-role key. To disable in
// production, unset DEMO_LOGIN. Mints a magic-link token via the Admin API,
// then hands off to /auth/confirm to establish the session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  if (process.env.DEMO_LOGIN !== "1") {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  if (!url || !serviceKey || !email) {
    return NextResponse.redirect(new URL("/login?error=demo_config", origin));
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Only allow impersonating a real, active employee.
  const { data: emp } = await admin
    .from("employees")
    .select("id")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (!emp) {
    return NextResponse.redirect(new URL("/login?error=demo_unknown", origin));
  }

  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.redirect(new URL("/login?error=demo_link", origin));
  }
  return NextResponse.redirect(new URL(`/auth/confirm?token_hash=${tokenHash}&type=magiclink&next=/`, origin));
}
