import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import type { AssignmentType } from "@/lib/types";

type Row = {
  id: string;
  type: AssignmentType;
  status: string;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_job_title: string | null;
};

export default async function FormsPage() {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.from("v_my_assignments").select("*").order("type");
  const list = (data ?? []) as Row[];
  const todo = list.filter((a) => a.status !== "submitted");
  const done = list.filter((a) => a.status === "submitted");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Home</Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold">My forms</h1>

      <Section title={`To do (${todo.length})`} items={todo} />
      {done.length > 0 && <Section title={`Submitted (${done.length})`} items={done} done />}
      {list.length === 0 && (
        <p className="text-sm text-gray-500">No feedback forms assigned in the current cycle.</p>
      )}
    </main>
  );
}

function Section({ title, items, done }: { title: string; items: Row[]; done?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-gray-500">{title}</h2>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={`/forms/${a.id}`}
              className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-gray-200 transition hover:ring-gray-400"
            >
              <div>
                <div className="font-medium">
                  {a.type === "self"
                    ? "Self-evaluation"
                    : `${a.recipient_first_name} ${a.recipient_last_name}`}
                </div>
                <div className="text-xs text-gray-500">
                  {a.type}
                  {a.recipient_job_title ? ` · ${a.recipient_job_title}` : ""}
                </div>
              </div>
              <span className={`text-xs ${done ? "text-green-600" : "text-gray-400"}`}>{a.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
