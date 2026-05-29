import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";
import { MatchingReview, type ReportCard, type Counterpart } from "@/components/MatchingReview";

// Row shape returned by matching_review_for_manager().
type ReviewRow = {
  report_id: string;
  report_first: string;
  report_last: string;
  report_division: string | null;
  given_count: number;
  received_count: number;
  direction: "incoming" | "outgoing";
  counterpart_id: string;
  counterpart_first: string;
  counterpart_last: string;
  assignment_type: string;
};

export default async function MatchingPage() {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  // Only managers / admins review the matching.
  if (!me.is_super_admin && me.role === "ic") redirect("/");
  const locale = await getLocale();
  const t = dict[locale];
  const cs = locale === "cs";

  const supabase = await createClient();

  // Gating: only cycles in 'in_review' are reviewable. The live/active cycle
  // (matching_status='active') is intentionally excluded, so it never shows.
  const { data: cyc } = await supabase
    .from("evaluation_cycles")
    .select("id,name,matching_status,created_at")
    .eq("matching_status", "in_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const empty = (
    <>
      <AppHeader me={me} locale={locale} active="matching" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title={t.matchingReviewTitle} subtitle={t.matchingReviewSubtitle} />
        <EmptyState icon={<Icon name="info" size={22} />} title={t.matchingNoReview} hint={t.matchingNoReviewHint} />
      </main>
    </>
  );

  if (!cyc) return empty;

  // Per-report review detail for this manager (or all reports if admin).
  const { data: rowsData } = await supabase.rpc("matching_review_for_manager", { p_cycle_id: cyc.id });
  const rows = (rowsData ?? []) as ReviewRow[];
  if (rows.length === 0) return empty;

  // Group rows into one card per report, preserving the function's ordering.
  const byReport = new Map<string, ReportCard>();
  for (const r of rows) {
    let card = byReport.get(r.report_id);
    if (!card) {
      card = {
        report_id: r.report_id,
        report_first: r.report_first,
        report_last: r.report_last,
        report_division: r.report_division,
        given_count: r.given_count,
        received_count: r.received_count,
        counterparts: [],
      };
      byReport.set(r.report_id, card);
    }
    const cp: Counterpart = {
      direction: r.direction,
      counterpart_id: r.counterpart_id,
      counterpart_first: r.counterpart_first,
      counterpart_last: r.counterpart_last,
      assignment_type: r.assignment_type,
    };
    card.counterparts.push(cp);
  }
  const reports = [...byReport.values()].sort((a, b) =>
    `${a.report_last} ${a.report_first}`.localeCompare(`${b.report_last} ${b.report_first}`),
  );

  // This manager's own approval row (RLS lets them read only their own).
  const { data: approval } = await supabase
    .from("matching_approvals")
    .select("status,note")
    .eq("cycle_id", cyc.id)
    .eq("manager_id", me.id)
    .maybeSingle();

  return (
    <>
      <AppHeader me={me} locale={locale} active="matching" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title={t.matchingReviewTitle} subtitle={cyc.name} />
        <PageGuide
          id="matching"
          title={t.matchingReviewTitle}
          points={[
            cs
              ? "U každého podřízeného vidíte, kdo ho bude hodnotit a koho bude hodnotit on."
              : "For each report you see who will review them and whom they will review.",
            cs
              ? "Každý dává i přijímá alespoň 4 zpětné vazby (mimo sebehodnocení)."
              : "Everyone gives and receives at least 4 feedbacks (self excluded).",
            cs
              ? "Schvalte, nebo požádejte o změny s poznámkou. Úpravy provádí pouze administrátor."
              : "Approve, or request changes with a note. Only the admin edits the matching.",
          ]}
        />
        <MatchingReview
          cycleId={cyc.id}
          reports={reports}
          decision={(approval?.status as "pending" | "approved" | "changes_requested" | undefined) ?? null}
          decisionNote={approval?.note ?? null}
          locale={locale}
        />
      </main>
    </>
  );
}
