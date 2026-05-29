import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import AdminPanel from "@/components/AdminPanel";
import { AppHeader } from "@/components/AppHeader";
import type { EvaluationCycle } from "@/lib/types";

export default async function AdminPage() {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  if (!me.is_super_admin) redirect("/");
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: cycles } = await supabase.from("evaluation_cycles").select("*").order("created_at");

  const stats: Record<string, { assignments: number; submitted: number; relationships: number; questions: number }> = {};
  for (const c of (cycles ?? []) as EvaluationCycle[]) {
    const [a, s, r, q] = await Promise.all([
      supabase.from("feedback_assignments").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
      supabase.from("feedback_assignments").select("id", { count: "exact", head: true }).eq("cycle_id", c.id).eq("status", "submitted"),
      supabase.from("cycle_relationships").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
    ]);
    stats[c.id] = {
      assignments: a.count ?? 0,
      submitted: s.count ?? 0,
      relationships: r.count ?? 0,
      questions: q.count ?? 0,
    };
  }

  return (
    <>
      <AppHeader me={me} locale={locale} active="admin" />
      <AdminPanel cycles={(cycles ?? []) as EvaluationCycle[]} stats={stats} />
    </>
  );
}
