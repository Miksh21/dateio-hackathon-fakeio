import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import FeedbackForm from "@/components/FeedbackForm";
import type { Question } from "@/lib/types";

type Answer = { scale_value: number | null; text_value: string | null; choice_value: string | null };

export default async function FormPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const { assignmentId } = await params;

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("v_my_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: allQuestions } = await supabase
    .from("questions")
    .select("*")
    .eq("cycle_id", assignment.cycle_id)
    .order("sort_order");
  const questions = ((allQuestions ?? []) as Question[]).filter((q) =>
    q.target_assignment_types.includes(assignment.type),
  );

  const { data: responses } = await supabase
    .from("responses")
    .select("question_id,scale_value,text_value,choice_value")
    .eq("assignment_id", assignmentId);

  const initial: Record<string, Answer> = {};
  for (const r of responses ?? []) {
    initial[r.question_id] = {
      scale_value: r.scale_value,
      text_value: r.text_value,
      choice_value: r.choice_value,
    };
  }

  const now = Date.now();
  const formOpen =
    (!assignment.form_start || new Date(assignment.form_start).getTime() <= now) &&
    (!assignment.form_end || new Date(assignment.form_end).getTime() >= now);
  const editable = formOpen && assignment.status !== "submitted";

  return (
    <FeedbackForm
      assignment={{
        id: assignment.id,
        type: assignment.type,
        status: assignment.status,
        recipient_first_name: assignment.recipient_first_name,
        recipient_last_name: assignment.recipient_last_name,
        recipient_job_title: assignment.recipient_job_title,
        cycle_name: assignment.cycle_name,
      }}
      questions={questions}
      initial={initial}
      editable={editable}
    />
  );
}
