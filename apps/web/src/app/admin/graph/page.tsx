import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import GraphEditor from "@/components/GraphEditor";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // demo cycle (multi-cycle later)

export default async function GraphPage() {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  if (!me.is_super_admin) redirect("/");

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id,first_name,last_name,division,role")
    .eq("is_active", true)
    .order("division")
    .order("last_name");
  const { data: rels } = await supabase
    .from("cycle_relationships")
    .select("id,from_employee_id,to_employee_id,relationship_type")
    .eq("cycle_id", CYCLE);

  return <GraphEditor cycleId={CYCLE} employees={employees ?? []} relationships={rels ?? []} />;
}
