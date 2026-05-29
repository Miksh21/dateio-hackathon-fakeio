import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // demo cycle (multi-cycle later)

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

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-36 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs text-gray-500">{done}/{total} · {pct}%</span>
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
            const g = m.get(r.from_id) ?? {
              name: `${r.from_last_name}, ${r.from_first_name}`,
              total: 0,
              submitted: 0,
            };
            g.total++;
            if (r.status === "submitted") g.submitted++;
            m.set(r.from_id, g);
            return m;
          }, new Map<string, { name: string; total: number; submitted: number }>())
          .values(),
      ].sort((a, b) => a.submitted / a.total - b.submitted / b.total)
    : [];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Home</Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold">Completion report</h1>
      <p className="mb-4 text-sm text-gray-500">Who has submitted their feedback.</p>

      <div className="mb-6 rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <div className="mb-1 text-sm font-medium">Overall</div>
        <Bar done={submitted} total={total} />
      </div>

      <div className="mb-3 flex gap-2 text-sm">
        <Link href="/report?by=team" className={`rounded-md px-3 py-1.5 ${by === "team" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}>By team</Link>
        <Link href="/report?by=manager" className={`rounded-md px-3 py-1.5 ${by === "manager" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}>By manager</Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">No assignments visible to you in this cycle.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1 font-medium">{by === "manager" ? "Manager" : "Team"}</th>
              <th className="font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {groupRows.map((g) => (
              <tr key={g.key} className="border-t border-gray-100">
                <td className="py-2 text-sm">
                  <Link href={`/report?by=${by}&focus=${encodeURIComponent(g.key)}`} className="text-gray-800 hover:underline">
                    {g.key}
                  </Link>
                </td>
                <td><Bar done={g.submitted} total={g.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {focusGroup && (
        <section className="mt-6 rounded-xl bg-white p-4 ring-1 ring-gray-200">
          <h2 className="mb-3 text-sm font-medium">{focusGroup.key} — by person</h2>
          <ul className="space-y-1">
            {givers.map((g) => {
              const done = g.submitted >= g.total;
              return (
                <li key={g.name} className="flex items-center justify-between text-sm">
                  <span className={done ? "text-gray-700" : "text-red-600"}>{g.name}</span>
                  <span className="text-xs text-gray-500">
                    {g.submitted}/{g.total}
                    {done ? "" : " · missing"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
