import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import AdminPanel, { type MatchingStat } from "@/components/AdminPanel";
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

  type CoverageRow = { employee_id: string; first_name: string; last_name: string; given_count: number; received_count: number; given_ok: boolean; received_ok: boolean };

  const stats: Record<string, MatchingStat> = {};
  for (const c of (cycles ?? []) as EvaluationCycle[]) {
    const [a, s, r, q, cov, appr] = await Promise.all([
      supabase.from("feedback_assignments").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
      supabase.from("feedback_assignments").select("id", { count: "exact", head: true }).eq("cycle_id", c.id).eq("status", "submitted"),
      supabase.from("cycle_relationships").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("cycle_id", c.id),
      supabase.rpc("matching_coverage", { p_cycle_id: c.id }),
      supabase.from("matching_approvals").select("status").eq("cycle_id", c.id),
    ]);
    const covRows = (cov.data ?? []) as CoverageRow[];
    const below = covRows
      .filter((x) => !x.given_ok || !x.received_ok)
      .map((x) => ({ name: `${x.first_name} ${x.last_name}`, given: x.given_count, received: x.received_count }));
    const apprRows = (appr.data ?? []) as { status: string }[];
    stats[c.id] = {
      assignments: a.count ?? 0,
      submitted: s.count ?? 0,
      relationships: r.count ?? 0,
      questions: q.count ?? 0,
      coverageTotal: covRows.length,
      coverageBelow: below,
      approvalsTotal: apprRows.length,
      approvalsApproved: apprRows.filter((x) => x.status === "approved").length,
    };
  }

  return (
    <>
      <AppHeader me={me} locale={locale} active="admin" />
      <AdminPanel cycles={(cycles ?? []) as EvaluationCycle[]} stats={stats} locale={locale} />
    </>
  );
}
