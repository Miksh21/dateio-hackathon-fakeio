"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EvaluationCycle } from "@/lib/types";
import { dict, type Locale } from "@/lib/i18n";
import { Card, PageHeader, Stat, Badge, Button, ProgressBar, buttonClass, type Tone } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";

export type MatchingStat = {
  assignments: number;
  submitted: number;
  relationships: number;
  questions: number;
  coverageTotal: number;
  coverageBelow: { name: string; given: number; received: number }[];
  approvalsTotal: number;
  approvalsApproved: number;
};
type Stats = Record<string, MatchingStat>;

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", open: "mint", closed: "pearl", published: "aqua" };
const MATCHING_TONE: Record<string, Tone> = { draft: "neutral", in_review: "sun", approved: "sky", active: "mint" };

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
  const t = dict[locale];
  const matchingStatusLabel: Record<string, string> = {
    draft: t.matchingStatusDraft,
    in_review: t.matchingStatusInReview,
    approved: t.matchingStatusApproved,
    active: t.matchingStatusActive,
  };
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

  const propose = (id: string) =>
    run(async () => {
      const { error } = await supabase.rpc("propose_matching", { p_cycle_id: id });
      if (error) throw error;
    }, t.matchingProposeForApproval);

  const activate = (id: string) =>
    run(async () => {
      const { error } = await supabase.rpc("activate_matching", { p_cycle_id: id });
      if (error) throw error;
    }, t.matchingActivate);

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
          const st: MatchingStat =
            stats[c.id] ?? {
              assignments: 0,
              submitted: 0,
              relationships: 0,
              questions: 0,
              coverageTotal: 0,
              coverageBelow: [],
              approvalsTotal: 0,
              approvalsApproved: 0,
            };
          const coverageOk = st.coverageTotal > 0 && st.coverageBelow.length === 0;
          const allApproved = st.approvalsTotal > 0 && st.approvalsApproved >= st.approvalsTotal;
          return (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-ink">{c.name}</h2>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      <span className="capitalize">{c.status}</span>
                    </Badge>
                    <Badge tone={MATCHING_TONE[c.matching_status] ?? "neutral"}>{matchingStatusLabel[c.matching_status] ?? c.matching_status}</Badge>
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

              {/* Matching review: coverage + propose + approval progress + activate */}
              <div className="mt-4 rounded-xl bg-canvas p-4 ring-1 ring-black/[0.05]">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Icon name="graph" size={15} /> {t.matchingAdminTitle}
                </h3>

                {/* Coverage panel */}
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-ink-600">{t.matchingCoverage}</div>
                  {st.coverageTotal === 0 ? (
                    <p className="text-xs text-ink-600">—</p>
                  ) : coverageOk ? (
                    <p className="flex items-center gap-1.5 text-xs text-aqua-700">
                      <Icon name="check" size={14} /> {t.matchingCoverageOk}
                    </p>
                  ) : (
                    <div className="rounded-lg bg-white p-2 ring-1 ring-black/[0.05]">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-600">{t.matchingCoverageBelow}</div>
                      <ul className="space-y-0.5">
                        {st.coverageBelow.map((p) => (
                          <li key={p.name} className="flex items-center justify-between text-xs">
                            <span className="text-ink">{p.name}</span>
                            <span className="tabular-nums text-ink-600">
                              {t.matchingGiven} {p.given} · {t.matchingReceived} {p.received}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Approval progress */}
                {st.approvalsTotal > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex justify-between text-xs text-ink-600">
                      <span>{t.matchingApprovalProgress}</span>
                      <span className="tabular-nums">
                        {st.approvalsApproved} / {st.approvalsTotal} {t.matchingManagersApproved}
                      </span>
                    </div>
                    <ProgressBar value={st.approvalsApproved} max={st.approvalsTotal} tone={allApproved ? "mint" : "sun"} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={busy || !coverageOk || c.matching_status === "active"} onClick={() => propose(c.id)}>
                    {t.matchingProposeForApproval}
                  </Button>
                  <Button variant="primary" disabled={busy || !allApproved || c.matching_status === "active"} onClick={() => activate(c.id)}>
                    {t.matchingActivate}
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-ink-600">{!coverageOk ? t.matchingProposeHint : !allApproved ? t.matchingActivateHint : t.matchingStatusApproved}</p>
              </div>
            </Card>
          );
        })}
        {cycles.length === 0 && <p className="text-sm text-ink-600">No cycles yet.</p>}
      </div>
    </main>
  );
}
