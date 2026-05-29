import { createClient } from "@supabase/supabase-js";
import { LoginClient, type DemoUser } from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const demoEnabled = process.env.DEMO_LOGIN === "1" && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  let demoUsers: DemoUser[] = [];
  if (demoEnabled) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    // Optional allow-list (comma-separated emails) to keep the demo picker short.
    const allow = (process.env.DEMO_LOGIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    let query = admin
      .from("employees")
      .select("email,first_name,last_name,role,division,is_super_admin")
      .eq("is_active", true);
    if (allow.length) query = query.in("email", allow);
    const { data } = await query.order("last_name");
    demoUsers = (data ?? []) as DemoUser[];
  }
  return <LoginClient demoEnabled={demoEnabled} demoUsers={demoUsers} />;
}
