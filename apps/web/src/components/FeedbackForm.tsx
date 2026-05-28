"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { qText, optLabel, dict, type Locale } from "@/lib/i18n";
import type { Question, AssignmentType } from "@/lib/types";

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

export default function FeedbackForm({
  assignment,
  questions,
  initial,
  editable,
}: {
  assignment: AssignmentInfo;
  questions: Question[];
  initial: Record<string, Answer>;
  editable: boolean;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [answers, setAnswers] = useState<Record<string, Answer>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef<Record<string, number>>({});
  const t = dict[locale];

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
    setSaving(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setError(null);
    const missing = questions.filter((q) => q.is_required && isEmpty(answers[q.id]));
    if (missing.length) {
      setError(`${missing.length} required question(s) still unanswered.`);
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

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <a href="/forms" className="text-sm text-gray-500 hover:text-gray-900">← {t.myForms}</a>
          <h1 className="mt-1 text-xl font-semibold">
            {assignment.type === "self" ? "Self-evaluation" : recipient}
          </h1>
          <p className="text-sm text-gray-500">
            {assignment.type} · {assignment.cycle_name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLocale(locale === "en" ? "cs" : "en")}
          className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
        >
          {locale === "en" ? "CS" : "EN"}
        </button>
      </div>

      {!editable && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {assignment.status === "submitted" ? "Submitted — read only." : "This form is closed."}
        </p>
      )}

      <div className="space-y-5">
        {questions.map((q, i) => (
          <fieldset key={q.id} disabled={!editable} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <legend className="mb-3 text-sm font-medium text-gray-800">
              {i + 1}. {qText(q, locale)}
              {q.is_required && <span className="text-red-500"> *</span>}
            </legend>
            {renderInput(q, answers[q.id], locale, setAnswer)}
          </fieldset>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <span className="text-xs text-gray-400">{saving ? t.loading : t.saved}</span>
        {editable && (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? t.loading : t.submit}
          </button>
        )}
      </div>
    </main>
  );
}

function isEmpty(a: Answer | undefined): boolean {
  if (!a) return true;
  return a.scale_value == null && a.choice_value == null && !(a.text_value && a.text_value.trim());
}

function renderInput(
  q: Question,
  a: Answer | undefined,
  locale: Locale,
  setAnswer: (qid: string, patch: Partial<Answer>, debounce?: boolean) => void,
) {
  if (q.type === "text") {
    return (
      <textarea
        rows={4}
        defaultValue={a?.text_value ?? ""}
        onChange={(e) => setAnswer(q.id, { text_value: e.target.value }, true)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        placeholder="…"
      />
    );
  }
  if (q.type === "scale_10") {
    return (
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAnswer(q.id, { scale_value: n })}
            className={`h-9 w-9 rounded-md text-sm ${a?.scale_value === n ? "bg-gray-900 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  // scale_5 and multi_choice render their labeled options
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
            onClick={() =>
              setAnswer(q.id, q.type === "multi_choice" ? { choice_value: val } : { scale_value: o.value })
            }
            className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${isSel ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:bg-gray-50"}`}
          >
            {optLabel(o, locale)}
          </button>
        );
      })}
    </div>
  );
}
