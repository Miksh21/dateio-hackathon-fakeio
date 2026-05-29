"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EvaluationCycle } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { Card, PageHeader, Stat, Badge, Button, ProgressBar, buttonClass, type Tone } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";

type StatT = { assignments: number; submitted: number; relationships: number; questions: number };
type Stats = Record<string, StatT>;

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", open: "mint", closed: "pearl", published: "aqua" };

function cycleNote(status: string, cs: boolean): string {
  switch (status) {
    case "draft":
      return cs ? "Koncept — otevřením spustíte sběr." : "Draft — open it to start collecting.";
    case "open":
      return cs ? "Probíhá sběr zpětné vazby." : "Collecting feedback.";
    case "closed":
      return cs ? "Uzavřeno. Vygenerujte AI souhrny přes n8n, poté publikujte." : "Closed. Generate AI summaries via the n8n flow, then Publish.";
    case "published":
      return cs ? "Publikováno — oprávnění lidé vidí své výsledky." : "Published — permitted people can see their results.";
    default:
      return status;
  }
}

export default function AdminPanel({ cycles, stats, locale }: { cycles: EvaluationCycle[]; stats: Stats; locale: Locale }) {
  const router = useRouter();
  const cs = locale === "cs";
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Admin · Cycles" subtitle="Open a cycle, draw the graph, publish results." />

      <PageGuide
        id="admin"
        title={cs ? "Řízení cyklu" : "Running a cycle"}
        points={[
          cs ? "Otevřít + generovat: spustí cyklus a vytvoří přiřazení podle grafu." : "Open + generate: starts the cycle and builds feedback assignments from the graph.",
          cs ? "Otevřít editor grafu: nakreslete, kdo koho hodnotí (manažeři → podřízení, kolegové)." : "Open graph editor: draw who reviews whom (managers → reports, peers).",
          cs ? "Po úpravě grafu znovu klikněte Otevřít + generovat." : "After editing the graph, click Open + generate again to apply.",
          cs ? "Publikovat: zpřístupní výsledky zaměstnancům." : "Publish: makes results visible to employees.",
          cs
            ? "AI souhrny: po uzavření je vygeneruje n8n flow (zatím ručně), pak je vidí oprávnění lidé."
            : "AI summaries: after closing, the n8n flow generates them (manual for now); permitted people then read them.",
        ]}
      />

      {msg && <p className="mb-4 rounded-xl bg-black/[0.04] px-3 py-2 text-sm text-ink">{msg}</p>}

      <div className="space-y-4">
        {cycles.map((c) => {
          const st = stats[c.id] ?? { assignments: 0, submitted: 0, relationships: 0, questions: 0 };
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-ink">{c.name}</h2>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      <span className="capitalize">{c.status}</span>
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-600">anonymity ≥ {c.anon_min_responses} responses</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="primary" disabled={busy} onClick={() => open(c.id)}>
                    Open + generate
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => close(c.id)}>
                    Close
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => publish(c.id)}>
                    Publish
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Questions" value={st.questions} />
                <Stat label="Relationships" value={st.relationships} />
                <Stat label="Assignments" value={st.assignments} />
              </div>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-ink-600">
                  <span>Submitted</span>
                  <span>
                    {st.submitted}/{st.assignments}
                    {st.assignments ? ` · ${Math.round((st.submitted / st.assignments) * 100)}%` : ""}
                  </span>
                </div>
                <ProgressBar value={st.submitted} max={st.assignments} tone="mint" />
              </div>

              <p className="mt-3 text-xs text-ink-600">{cycleNote(c.status, cs)}</p>

              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <Link href="/admin/graph" className={buttonClass("secondary")}>
                  <Icon name="graph" size={16} /> Open graph editor
                </Link>
              </div>
            </Card>
          );
        })}
        {cycles.length === 0 && <p className="text-sm text-ink-600">No cycles yet.</p>}
      </div>
    </main>
  );
}
