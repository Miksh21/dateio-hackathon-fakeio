import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { AppHeader } from "@/components/AppHeader";
import { Card, PageHeader, EmptyState, cn } from "@/components/ui";
import { Icon } from "@/components/Icon";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

type Row = {
  id: string;
  type: string;
  status: string;
  from_id: string;
  from_first_name: string;
  from_last_name: string;
  from_division: string | null;
  from_manager_id: string | null;
  from_manager_first: string | null;
  from_manager_last: string | null;
};

function pctColor(pct: number): string {
  return pct >= 80 ? "#3f7178" : pct >= 50 ? "#deb869" : "#e0726a";
}

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-black/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pctColor(pct) }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-ink-600">
        {done}/{total} · {pct}%
      </span>
    </div>
  );
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string; focus?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const cs = locale === "cs";
  const sp = await searchParams;
  const by: "team" | "manager" = sp.by === "manager" ? "manager" : "team";
  const focus = sp.focus ?? null;

  const supabase = await createClient();
  const { data } = await supabase.from("v_assignment_status").select("*").eq("cycle_id", CYCLE);
  const rows = (data ?? []) as Row[];

  const total = rows.length;
  const submitted = rows.filter((r) => r.status === "submitted").length;

  const groupKey = (r: Row) =>
    by === "manager"
      ? r.from_manager_id
        ? `${r.from_manager_last}, ${r.from_manager_first}`
        : cs
          ? "(bez manažera)"
          : "(no manager)"
      : r.from_division ?? "—";

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = groupKey(r);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }
  const groupRows = [...groups.entries()]
    .map(([key, rs]) => ({
      key,
      total: rs.length,
      submitted: rs.filter((r) => r.status === "submitted").length,
      rows: rs,
    }))
    .sort((a, b) => a.submitted / a.total - b.submitted / b.total);

  const focusGroup = focus ? groupRows.find((g) => g.key === focus) : null;
  const givers = focusGroup
    ? [
        ...focusGroup.rows
          .reduce((m, r) => {
            const g = m.get(r.from_id) ?? { name: `${r.from_last_name}, ${r.from_first_name}`, total: 0, submitted: 0 };
            g.total++;
            if (r.status === "submitted") g.submitted++;
            m.set(r.from_id, g);
            return m;
          }, new Map<string, { name: string; total: number; submitted: number }>())
          .values(),
      ].sort((a, b) => a.submitted / a.total - b.submitted / b.total)
    : [];

  const tab = (key: "team" | "manager", label: string) => (
    <Link
      href={`/report?by=${key}`}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
        by === key ? "bg-ink text-white" : "bg-white text-ink-600 ring-1 ring-black/10 hover:text-ink",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <AppHeader me={me} locale={locale} active="report" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title={cs ? "Přehled dokončení" : "Completion report"}
          subtitle={cs ? "Kdo už odeslal svou zpětnou vazbu." : "Who has submitted their feedback."}
        />

        <Card className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">{cs ? "Celkem" : "Overall"}</span>
            <span className="text-sm font-semibold text-ink">{total ? Math.round((submitted / total) * 100) : 0}%</span>
          </div>
          <Bar done={submitted} total={total} />
        </Card>

        <div className="mb-4 flex gap-2">
          {tab("team", cs ? "Podle týmu" : "By team")}
          {tab("manager", cs ? "Podle manažera" : "By manager")}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="info" size={22} />}
            title={cs ? "Žádná data" : "No assignments visible"}
            hint={cs ? "V tomto cyklu pro vás nejsou viditelná žádná přiřazení." : "No assignments are visible to you in this cycle."}
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
              <span>{by === "manager" ? (cs ? "Manažer" : "Manager") : cs ? "Tým" : "Team"}</span>
              <span>{cs ? "Odesláno" : "Submitted"}</span>
            </div>
            <ul className="divide-y divide-black/[0.05]">
              {groupRows.map((g) => (
                <li key={g.key}>
                  <Link
                    href={`/report?by=${by}&focus=${encodeURIComponent(g.key)}`}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-black/[0.02]",
                      focus === g.key && "bg-aqua/5",
                    )}
                  >
                    <span className="truncate text-ink">{g.key}</span>
                    <Bar done={g.submitted} total={g.total} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {focusGroup && (
          <Card className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {focusGroup.key} — {cs ? "po lidech" : "by person"}
            </h2>
            <ul className="space-y-1.5">
              {givers.map((g) => {
                const done = g.submitted >= g.total;
                return (
                  <li key={g.name} className="flex items-center justify-between text-sm">
                    <span className={cn("flex items-center gap-1.5", done ? "text-ink" : "text-red-600")}>
                      {done && <Icon name="check" size={14} className="text-aqua" />}
                      {g.name}
                    </span>
                    <span className="text-xs tabular-nums text-ink-600">
                      {g.submitted}/{g.total}
                      {done ? "" : cs ? " · chybí" : " · missing"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
