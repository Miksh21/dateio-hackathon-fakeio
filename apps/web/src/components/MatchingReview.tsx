"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dict, assignmentTypeLabel, type Locale } from "@/lib/i18n";
import { Card, Badge, buttonClass, cn, type Tone } from "@/components/ui";
import { Icon } from "@/components/Icon";

// One reviewer / reviewee counterpart on a report's card.
export type Counterpart = {
  direction: "incoming" | "outgoing";
  counterpart_id: string;
  counterpart_first: string;
  counterpart_last: string;
  assignment_type: string;
};

export type ReportCard = {
  report_id: string;
  report_first: string;
  report_last: string;
  report_division: string | null;
  given_count: number;
  received_count: number;
  counterparts: Counterpart[];
};

const TYPE_TONE: Record<string, Tone> = { self: "sky", upward: "lavender", downward: "pearl", peer: "mint" };

export function MatchingReview({
  cycleId,
  reports,
  decision,
  decisionNote,
  locale,
}: {
  cycleId: string;
  reports: ReportCard[];
  decision: "pending" | "approved" | "changes_requested" | null;
  decisionNote: string | null;
  locale: Locale;
}) {
  const t = dict[locale];
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [note, setNote] = useState(decisionNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(status: "approved" | "changes_requested") {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.rpc("decide_matching", {
        p_cycle_id: cycleId,
        p_status: status,
        p_note: note.trim() === "" ? null : note.trim(),
      });
      if (error) throw error;
      setMsg(t.matchingDecisionSaved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    decision === "approved" ? (
      <Badge tone="mint">
        <Icon name="check" size={13} /> {t.matchingApproved}
      </Badge>
    ) : decision === "changes_requested" ? (
      <Badge tone="sun">{t.matchingChangesRequested}</Badge>
    ) : (
      <Badge tone="neutral">{t.matchingPending}</Badge>
    );

  return (
    <div className="space-y-5">
      {/* Decision bar */}
      <Card className={cn(decision === "approved" && "bg-mint-light ring-mint")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            {t.matchingYourDecision} {statusBadge}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => decide("approved")} className={buttonClass("primary")}>
              <Icon name="check" size={16} /> {t.matchingApprove}
            </button>
            <button type="button" disabled={busy} onClick={() => decide("changes_requested")} className={buttonClass("secondary")}>
              {t.matchingRequestChanges}
            </button>
          </div>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.matchingNotePlaceholder}
          rows={2}
          className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink focus:border-aqua focus:outline-none"
        />
        {msg && <p className="mt-2 text-xs text-ink-600">{msg}</p>}
      </Card>

      {/* One card per direct report */}
      {reports.map((r) => {
        const reviewers = r.counterparts.filter((c) => c.direction === "incoming");
        const reviewees = r.counterparts.filter((c) => c.direction === "outgoing");
        const ok = r.given_count >= 4 && r.received_count >= 4;
        return (
          <Card key={r.report_id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-ink">
                  {r.report_first} {r.report_last}
                </h2>
                {r.report_division && <p className="text-xs text-ink-600">{r.report_division}</p>}
              </div>
              <Badge tone={ok ? "mint" : "sun"}>
                {ok && <Icon name="check" size={13} />} {t.matchingGiven} {r.given_count} · {t.matchingReceived} {r.received_count}
                {ok ? ` · ${t.matchingFloorMet}` : ""}
              </Badge>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <PeopleList title={`${t.matchingReviews} (${reviewers.length})`} people={reviewers} locale={locale} />
              <PeopleList title={`${t.matchingReviewing} (${reviewees.length})`} people={reviewees} locale={locale} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PeopleList({ title, people, locale }: { title: string; people: Counterpart[]; locale: Locale }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</h3>
      <ul className="space-y-1.5">
        {people.map((p) => (
          <li key={`${p.direction}-${p.counterpart_id}-${p.assignment_type}`} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-ink">
              {p.counterpart_first} {p.counterpart_last}
            </span>
            <Badge tone={TYPE_TONE[p.assignment_type] ?? "neutral"}>{assignmentTypeLabel(p.assignment_type, locale)}</Badge>
          </li>
        ))}
        {people.length === 0 && <li className="text-xs text-ink-600">—</li>}
      </ul>
    </div>
  );
}
