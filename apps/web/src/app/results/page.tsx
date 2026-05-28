import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc"; // demo cycle (multi-cycle picker later)

type Q = { id: string; text: string; category: string | null; type: string };
type Agg = { question_id: string; response_count: number; avg_scale: number | string | null };
type Txt = { response_id: string; question_id: string; text_value: string };
type Person = { id: string; first_name: string; last_name: string };

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ recipient?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const target = sp.recipient || me.id;

  const supabase = await createClient();
  const { data: peopleData } = await supabase
    .from("employees")
    .select("id,first_name,last_name")
    .order("last_name");
  const people = (peopleData ?? []) as Person[];
  const targetPerson = people.find((p) => p.id === target);

  const [{ data: aggData }, { data: txtData }, { data: qData }] = await Promise.all([
    supabase.from("v_received_aggregated").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", target),
    supabase.from("v_received_text_anon").select("response_id,question_id,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target),
    supabase.from("questions").select("id,text,category,type").eq("cycle_id", CYCLE).order("sort_order"),
  ]);

  const qmap = new Map(((qData ?? []) as Q[]).map((q) => [q.id, q]));
  const scaleRows = ((aggData ?? []) as Agg[])
    .map((a) => ({
      q: qmap.get(a.question_id),
      count: a.response_count,
      avg: a.avg_scale == null ? null : Number(a.avg_scale),
    }))
    .filter((r): r is { q: Q; count: number; avg: number | null } =>
      !!r.q && (r.q.type === "scale_5" || r.q.type === "scale_10"),
    )
    .sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0));
  const texts = (txtData ?? []) as Txt[];
  const hasData = scaleRows.length > 0 || texts.length > 0;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Home</Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold">Results</h1>
      <p className="mb-4 text-sm text-gray-500">
        {targetPerson ? `${targetPerson.first_name} ${targetPerson.last_name}` : "You"}
      </p>

      {people.length > 1 && (
        <form method="get" className="mb-6">
          <select name="recipient" defaultValue={target} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>
            ))}
          </select>
          <button className="ml-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white">View</button>
        </form>
      )}

      {!hasData && (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
          Not enough responses to display yet (anonymity threshold), or this cycle isn’t published.
        </p>
      )}

      {scaleRows.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-gray-500">Ratings (average)</h2>
          <ul className="space-y-3">
            {scaleRows.map(({ q, count, avg }) => {
              const max = q.type === "scale_10" ? 10 : 5;
              const pct = avg ? (avg / max) * 100 : 0;
              return (
                <li key={q.id} className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span>{q.text}</span>
                    <span className="whitespace-nowrap font-semibold">{avg?.toFixed(1)} / {max}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-gray-800" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-gray-400">{count} responses</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {texts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-gray-500">Comments (anonymized)</h2>
          <ul className="space-y-2">
            {texts.map((t) => (
              <li key={t.response_id} className="rounded-xl bg-white p-3 text-sm text-gray-700 ring-1 ring-gray-200">
                “{t.text_value}”
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
