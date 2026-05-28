import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";

/** The employee row for the signed-in user, or null if not signed in or not an
 * employee. RLS lets a user read their own employees row. */
export async function getCurrentEmployee(): Promise<Employee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("employees")
    .select("*")
    .ilike("email", user.email)
    .maybeSingle();

  return (data as Employee) ?? null;
}
