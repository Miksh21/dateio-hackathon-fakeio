import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { dict, assignmentTypeLabel, statusLabel, type Locale } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Card, PageHeader, Badge, ProgressBar, EmptyState, type Tone } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";
import type { AssignmentType } from "@/lib/types";

type Row = {
  id: string;
  type: AssignmentType;
  status: string;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_job_title: string | null;
};

const TYPE_TONE: Record<string, Tone> = { self: "sky", upward: "lavender", downward: "pearl", peer: "mint" };

export default async function FormsPage() {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const t = dict[locale];
  const cs = locale === "cs";

  const supabase = await createClient();
  const { data } = await supabase.from("v_my_assignments").select("*").order("type");
  const list = (data ?? []) as Row[];
  const todo = list.filter((a) => a.status !== "submitted");
  const done = list.filter((a) => a.status === "submitted");

  return (
    <>
      <AppHeader me={me} locale={locale} active="forms" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title={t.myForms} subtitle={cs ? "Zpětná vazba, kterou máte poskytnout" : "Feedback you've been asked to give"} />

        <PageGuide
          id="forms"
          title={cs ? "Co tu dělat" : "What to do here"}
          points={[
            cs
              ? "Každá karta je jeden člověk, kterého hodnotíte — sebe, nadřízeného (nahoru), podřízené (dolů) nebo kolegu."
              : "Each card is one person you review — yourself, your manager (upward), your reports (downward), or a peer.",
            cs ? "Otevřete ji, odpovězte a odešlete. Ukládá se průběžně." : "Open it, answer the questions, and submit. It autosaves.",
            cs ? "Vaše odpovědi jsou pro příjemce anonymní — zobrazují se souhrnně." : "Your answers are anonymous to the recipient — shown aggregated with others.",
          ]}
        />

        {list.length > 0 && (
          <Card className="mb-6">
            <div className="mb-1 flex justify-between text-xs text-ink-600">
              <span>{cs ? "Hotovo" : "Completed"}</span>
              <span>
                {done.length}/{list.length}
              </span>
            </div>
            <ProgressBar value={done.length} max={list.length} tone={done.length === list.length ? "mint" : "aqua"} />
          </Card>
        )}

        <Section title={`${cs ? "K vyplnění" : "To do"} (${todo.length})`} items={todo} locale={locale} />
        {done.length > 0 && (
          <Section title={`${statusLabel("submitted", locale)} (${done.length})`} items={done} locale={locale} done />
        )}
        {list.length === 0 && (
          <EmptyState
            icon={<Icon name="check" size={22} />}
            title={cs ? "Žádné formuláře" : "No forms assigned"}
            hint={cs ? "V tomto cyklu pro vás nejsou žádné formuláře." : "Nothing to fill out in the current cycle."}
          />
        )}
      </main>
    </>
  );
}

function Section({ title, items, locale, done }: { title: string; items: Row[]; locale: Locale; done?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</h2>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={`/forms/${a.id}`}
              className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.06] transition hover:ring-aqua/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-aqua/10 text-aqua">
                <Icon name={a.type === "self" ? "user" : "forms"} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">
                  {a.type === "self" ? assignmentTypeLabel("self", locale) : `${a.recipient_first_name} ${a.recipient_last_name}`}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge tone={TYPE_TONE[a.type] ?? "neutral"}>{assignmentTypeLabel(a.type, locale)}</Badge>
                  {a.recipient_job_title && a.type !== "self" && (
                    <span className="truncate text-xs text-ink-600">{a.recipient_job_title}</span>
                  )}
                </div>
              </div>
              {done ? (
                <Badge tone="mint">
                  <Icon name="check" size={12} />
                  {statusLabel("submitted", locale)}
                </Badge>
              ) : (
                <Badge tone="sun">{statusLabel("pending", locale)}</Badge>
              )}
              <Icon name="chevronRight" size={16} className="text-ink-600/40" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
