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
    const { data } = await admin
      .from("employees")
      .select("email,first_name,last_name,role,division,is_super_admin")
      .eq("is_active", true)
      .order("last_name");
    demoUsers = (data ?? []) as DemoUser[];
  }
  return <LoginClient demoEnabled={demoEnabled} demoUsers={demoUsers} />;
}
