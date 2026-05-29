"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { qText, optLabel, dict, assignmentTypeLabel, type Locale } from "@/lib/i18n";
import { buttonClass, Badge, ProgressBar, cn } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";
import type { Question, QuestionOption, AssignmentType } from "@/lib/types";

type AssignmentInfo = {
  id: string;
  type: AssignmentType;
  status: string;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_job_title: string | null;
  cycle_name: string;
};

type Answer = { scale_value: number | null; text_value: string | null; choice_value: string | null };
const EMPTY: Answer = { scale_value: null, text_value: null, choice_value: null };

type SetAnswer = (qid: string, patch: Partial<Answer>, debounce?: boolean) => void;
type Block = { kind: "single"; q: Question } | { kind: "matrix"; category: string | null; options: QuestionOption[]; items: Question[] };

// Coalesce consecutive scale_5 questions that share the same options + category
// into a single matrix block; everything else renders standalone.
function groupQuestions(qs: Question[]): Block[] {
  const blocks: Block[] = [];
  let run: Question[] = [];
  const sig = (q: Question) => `${q.type}|${q.category}|${(q.options ?? []).map((o) => o.value).join(",")}`;
  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) blocks.push({ kind: "single", q: run[0] });
    else blocks.push({ kind: "matrix", category: run[0].category, options: run[0].options ?? [], items: [...run] });
    run = [];
  };
  for (const q of qs) {
    const eligible = q.type === "scale_5" && (q.options?.length ?? 0) > 0;
    if (eligible && (run.length === 0 || sig(run[run.length - 1]) === sig(q))) {
      run.push(q);
    } else {
      flush();
      if (eligible) run.push(q);
      else blocks.push({ kind: "single", q });
    }
  }
  flush();
  return blocks;
}

function categoryLabel(cat: string | null, locale: Locale): string {
  const cs = locale === "cs";
  const m: Record<string, [string, string]> = {
    behavioral: ["Behaviour & collaboration", "Chování a spolupráce"],
    manager: ["Leadership & manager", "Vedení a manažer"],
  };
  const e = cat ? m[cat] : undefined;
  return e ? (cs ? e[1] : e[0]) : cs ? "Hodnocení" : "Ratings";
}

export default function FeedbackForm({
  assignment,
  questions,
  initial,
  editable,
  locale,
}: {
  assignment: AssignmentInfo;
  questions: Question[];
  initial: Record<string, Answer>;
  editable: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef<Record<string, number>>({});
  const t = dict[locale];
  const cs = locale === "cs";

  function setAnswer(qid: string, patch: Partial<Answer>, debounce = false) {
    setAnswers((prev) => {
      const merged: Answer = { ...EMPTY, ...prev[qid], ...patch };
      const next = { ...prev, [qid]: merged };
      if (debounce) {
        window.clearTimeout(timers.current[qid]);
        timers.current[qid] = window.setTimeout(() => void save(qid, merged), 700);
      } else {
        void save(qid, merged);
      }
      return next;
    });
  }

  async function save(qid: string, a: Answer) {
    if (!editable) return;
    setSaveState("saving");
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("responses")
        .upsert(
          { assignment_id: assignment.id, question_id: qid, scale_value: a.scale_value, text_value: a.text_value, choice_value: a.choice_value },
          { onConflict: "assignment_id,question_id" },
        );
      if (error) throw error;
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    setError(null);
    const missing = questions.filter((q) => q.is_required && isEmpty(answers[q.id]));
    if (missing.length) {
      setError(cs ? `Zbývá ${missing.length} povinných otázek.` : `${missing.length} required question(s) still unanswered.`);
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("feedback_assignments")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", assignment.id);
      if (error) throw error;
      router.push("/forms");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const recipient = `${assignment.recipient_first_name} ${assignment.recipient_last_name}`;
  const title = assignment.type === "self" ? assignmentTypeLabel("self", locale) : recipient;
  const answered = questions.filter((q) => !isEmpty(answers[q.id])).length;
  const total = questions.length;
  const blocks = groupQuestions(questions);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <Link className="mb-3 inline-flex items-center gap-1 text-sm text-ink-600 hover:text-ink" href="/forms">
        <Icon name="arrowLeft" size={15} /> {t.myForms}
      </Link>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <Badge tone="aqua">{assignmentTypeLabel(assignment.type, locale)}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-600">
          {assignment.recipient_job_title && assignment.type !== "self" ? `${assignment.recipient_job_title} · ` : ""}
          {assignment.cycle_name}
        </p>
      </div>

      {editable && (
        <PageGuide
          id="form"
          title={cs ? "Jak formulář vyplnit" : "How to fill this in"}
          points={[
            cs
              ? "U tabulkových otázek vyberte v každém řádku, jak často tvrzení platí (jeden kroužek na řádek)."
              : "For the table questions, pick how often each statement is true — one circle per row.",
            cs ? "Povinné otázky jsou označené *." : "Required questions are marked with *.",
            cs ? "Ukládá se průběžně; odešlete tlačítkem dole." : "It autosaves; submit with the button at the bottom.",
            cs ? "Vaše odpovědi jsou pro příjemce anonymní." : "Your answers are anonymous to the recipient.",
          ]}
        />
      )}

      {!editable && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-sun/20 px-3 py-2 text-sm text-ink">
          <Icon name="info" size={16} />
          {assignment.status === "submitted"
            ? cs
              ? "Odesláno — jen ke čtení."
              : "Submitted — read only."
            : cs
              ? "Tento formulář je uzavřen."
              : "This form is closed."}
        </p>
      )}

      <div className="space-y-4">
        {blocks.map((b, i) =>
          b.kind === "matrix" ? (
            <MatrixBlock key={`m${i}`} block={b} answers={answers} setAnswer={setAnswer} locale={locale} editable={editable} />
          ) : (
            <SingleBlock key={b.q.id} q={b.q} answers={answers} setAnswer={setAnswer} locale={locale} editable={editable} />
          ),
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-4 mt-6">
        <div className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-black/[0.08] backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-600">
              <span>
                {answered}/{total} {cs ? "zodpovězeno" : "answered"}
              </span>
              <span className="flex items-center gap-1">
                {saveState === "saving" && <>{cs ? "Ukládám…" : "Saving…"}</>}
                {saveState === "saved" && (
                  <>
                    <Icon name="check" size={13} className="text-aqua" /> {t.saved}
                  </>
                )}
              </span>
            </div>
            <ProgressBar value={answered} max={total} tone={answered === total ? "mint" : "aqua"} />
          </div>
          {editable && (
            <button type="button" onClick={submit} disabled={submitting} className={buttonClass("primary", "shrink-0")}>
              {submitting ? t.loading : t.submit}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function isEmpty(a: Answer | undefined): boolean {
  if (!a) return true;
  return a.scale_value == null && a.choice_value == null && !(a.text_value && a.text_value.trim());
}

function MatrixBlock({
  block,
  answers,
  setAnswer,
  locale,
  editable,
}: {
  block: Extract<Block, { kind: "matrix" }>;
  answers: Record<string, Answer>;
  setAnswer: SetAnswer;
  locale: Locale;
  editable: boolean;
}) {
  const cs = locale === "cs";
  return (
    <fieldset disabled={!editable} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
      <legend className="text-sm font-semibold text-ink">{categoryLabel(block.category, locale)}</legend>
      <p className="mb-3 mt-1 text-xs text-ink-600">
        {cs ? "U každého tvrzení vyberte, jak často platí." : "For each statement, choose how often it's true."}
      </p>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-2/5" />
              {block.options.map((o) => (
                <th key={o.value} className="px-1 pb-2 text-center align-bottom text-[11px] font-medium leading-tight text-ink-600">
                  {optLabel(o, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.items.map((q) => {
              const sel = answers[q.id]?.scale_value ?? null;
              return (
                <tr key={q.id} className="border-t border-black/[0.06]">
                  <td className="py-2.5 pr-3 align-middle text-ink">
                    {qText(q, locale)}
                    {q.is_required && <span className="text-red-500"> *</span>}
                  </td>
                  {block.options.map((o) => {
                    const on = sel === o.value;
                    return (
                      <td key={o.value} className="px-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => setAnswer(q.id, { scale_value: o.value })}
                          aria-label={`${qText(q, locale)} — ${optLabel(o, locale)}`}
                          aria-pressed={on}
                          className="mx-auto grid h-7 w-7 place-items-center rounded-full ring-1 ring-black/15 transition hover:ring-aqua"
                        >
                          {on && <span className="h-3.5 w-3.5 rounded-full bg-aqua" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

function SingleBlock({
  q,
  answers,
  setAnswer,
  locale,
  editable,
}: {
  q: Question;
  answers: Record<string, Answer>;
  setAnswer: SetAnswer;
  locale: Locale;
  editable: boolean;
}) {
  return (
    <fieldset disabled={!editable} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
      <legend className="mb-3 text-sm font-medium text-ink">
        {qText(q, locale)}
        {q.is_required && <span className="text-red-500"> *</span>}
      </legend>
      {renderInput(q, answers[q.id], locale, setAnswer)}
    </fieldset>
  );
}

function renderInput(q: Question, a: Answer | undefined, locale: Locale, setAnswer: SetAnswer) {
  if (q.type === "text") {
    return (
      <textarea
        rows={4}
        defaultValue={a?.text_value ?? ""}
        onChange={(e) => setAnswer(q.id, { text_value: e.target.value }, true)}
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-600/40 focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/30"
        placeholder={locale === "cs" ? "Napište svou odpověď…" : "Type your answer…"}
      />
    );
  }
  if (q.type === "scale_10") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => {
          const sel = a?.scale_value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setAnswer(q.id, { scale_value: n })}
              className={cn(
                "h-10 w-10 rounded-xl text-sm font-medium transition",
                sel ? "bg-aqua text-white shadow-sm" : "bg-canvas text-ink ring-1 ring-black/10 hover:ring-aqua/40",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    );
  }
  const opts = q.options ?? [];
  const selected = q.type === "multi_choice" ? a?.choice_value : a?.scale_value?.toString() ?? null;
  return (
    <div className="space-y-2">
      {opts.map((o) => {
        const val = o.value.toString();
        const isSel = selected === val;
        return (
          <button
            key={val}
            type="button"
            onClick={() => setAnswer(q.id, q.type === "multi_choice" ? { choice_value: val } : { scale_value: o.value })}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
              isSel ? "border-aqua bg-aqua/10 font-medium text-aqua" : "border-black/10 text-ink hover:border-black/25",
            )}
          >
            <span>{optLabel(o, locale)}</span>
            {isSel && <Icon name="check" size={16} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
