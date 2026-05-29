"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EvaluationCycle, RelationshipType } from "@/lib/types";

type Emp = { id: string; first_name: string; last_name: string };
type Stat = { assignments: number; submitted: number; relationships: number; questions: number };
type Stats = Record<string, Stat>;

export default function AdminPanel({
  cycles,
  employees,
  stats,
}: {
  cycles: EvaluationCycle[];
  employees: Emp[];
  stats: Stats;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, label: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} ✓`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const open = (id: string) =>
    run(async () => {
      const { error } = await supabase
        .from("evaluation_cycles")
        .update({
          status: "open",
          form_start: new Date().toISOString(),
          form_end: new Date(Date.now() + 30 * 864e5).toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      const { error: gErr } = await supabase.rpc("generate_assignments", { p_cycle_id: id });
      if (gErr) throw gErr;
    }, "Opened + generated assignments");

  const close = (id: string) =>
    run(async () => {
      const { error } = await supabase.from("evaluation_cycles").update({ status: "closed" }).eq("id", id);
      if (error) throw error;
    }, "Closed");

  const publish = (id: string) =>
    run(async () => {
      const { error } = await supabase
        .from("evaluation_cycles")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    }, "Published");

  const importReporting = (id: string) =>
    run(async () => {
      const { data: emps, error } = await supabase
        .from("employees")
        .select("id,reporting_to_id")
        .not("reporting_to_id", "is", null);
      if (error) throw error;
      const edges = (emps ?? []).map((e: { id: string; reporting_to_id: string | null }) => ({
        cycle_id: id,
        from_employee_id: e.reporting_to_id as string,
        to_employee_id: e.id,
        relationship_type: "manages" as RelationshipType,
      }));
      const { error: insErr } = await supabase
        .from("cycle_relationships")
        .upsert(edges, {
          onConflict: "cycle_id,from_employee_id,to_employee_id,relationship_type",
          ignoreDuplicates: true,
        });
      if (insErr) throw insErr;
    }, "Imported reporting graph");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <a href="/" className="text-sm text-gray-500 hover:text-gray-900">← Home</a>
      <h1 className="mb-6 mt-1 text-2xl font-semibold">Admin · Cycles</h1>
      {msg && <p className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-sm">{msg}</p>}

      <div className="space-y-4">
        {cycles.map((c) => {
          const st = stats[c.id] ?? { assignments: 0, submitted: 0, relationships: 0, questions: 0 };
          const pct = st.assignments ? Math.round((st.submitted / st.assignments) * 100) : 0;
          return (
            <div key={c.id} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">{c.name}</h2>
                  <p className="text-xs text-gray-500">
                    status: <span className="font-medium">{c.status}</span> · anon ≥ {c.anon_min_responses}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button disabled={busy} onClick={() => open(c.id)} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700 disabled:opacity-50">Open + generate</button>
                  <button disabled={busy} onClick={() => close(c.id)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">Close</button>
                  <button disabled={busy} onClick={() => publish(c.id)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">Publish</button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Questions" value={st.questions} />
                <Stat label="Relationships" value={st.relationships} />
                <Stat label="Assignments" value={st.assignments} />
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Submitted</span>
                  <span>{st.submitted}/{st.assignments} ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                <a href="/admin/graph" className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Open graph editor →</a>
                <span className="text-xs text-gray-400">draw the feedback graph by hand (manages / peer)</span>
              </div>
            </div>
          );
        })}
        {cycles.length === 0 && <p className="text-sm text-gray-500">No cycles yet.</p>}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function AddEdge({ cycleId, employees, onDone }: { cycleId: string; employees: Emp[]; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<RelationshipType>("manages");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!from || !to || from === to) return;
    setBusy(true);
    try {
      await supabase.from("cycle_relationships").insert({
        cycle_id: cycleId,
        from_employee_id: from,
        to_employee_id: to,
        relationship_type: type,
      });
      setFrom("");
      setTo("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-1 py-1">
        <option value="">from…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>
        ))}
      </select>
      <select value={type} onChange={(e) => setType(e.target.value as RelationshipType)} className="rounded border border-gray-300 px-1 py-1">
        <option value="manages">manages</option>
        <option value="peer">peer</option>
      </select>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-1 py-1">
        <option value="">to…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>
        ))}
      </select>
      <button disabled={busy} onClick={add} className="rounded bg-gray-900 px-2 py-1 text-white disabled:opacity-50">+ edge</button>
    </div>
  );
}
