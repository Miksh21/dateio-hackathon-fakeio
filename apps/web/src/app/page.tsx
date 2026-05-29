import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Card, Badge, ProgressBar, type Tone } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";
import { getCurrentCycleId } from "@/lib/cycle";

export default async function Home() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md">
          <h1 className="mb-2 text-lg font-semibold">Setup needed</h1>
          <p className="text-sm text-ink-600">
            Set <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="rounded bg-black/5 px-1">apps/web/.env.local</code> and restart{" "}
            <code className="rounded bg-black/5 px-1">npm run dev</code>.
          </p>
        </Card>
      </main>
    );
  }

  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const t = dict[locale];
  const cs = locale === "cs";

  const CYCLE = await getCurrentCycleId();
  const supabase = await createClient();
  const [{ data: asg }, { data: cyc }] = await Promise.all([
    supabase.from("v_my_assignments").select("status"),
    supabase.from("evaluation_cycles").select("name,status").eq("id", CYCLE).maybeSingle(),
  ]);
  const rows = (asg ?? []) as { status: string }[];
  const total = rows.length;
  const done = rows.filter((a) => a.status === "submitted").length;
  const todo = total - done;

  const tiles = [
    { key: "forms", href: "/forms", icon: "forms", title: t.myForms, sub: cs ? "Vyplňte svou zpětnou vazbu" : "Give your feedback", badge: todo > 0 ? `${todo} ${cs ? "k vyplnění" : "to do"}` : undefined, show: true },
    { key: "results", href: "/results", icon: "results", title: t.results, sub: cs ? "Zpětná vazba, kterou jste dostali" : "Feedback you received", show: true },
    { key: "report", href: "/report", icon: "report", title: t.report, sub: cs ? "Dokončení podle týmu / manažera" : "Completion by team / manager", show: me.is_super_admin || me.role !== "ic" },
    { key: "admin", href: "/admin", icon: "admin", title: t.admin, sub: cs ? "Cykly, graf, otázky" : "Cycles, graph, questions", show: me.is_super_admin },
  ].filter((x) => x.show) as { key: string; href: string; icon: IconName; title: string; sub: string; badge?: string }[];

  const statusTone: Tone = cyc?.status === "open" ? "mint" : cyc?.status === "published" ? "aqua" : "neutral";

  const guide = [
    cs ? "Moje formuláře: vyplňte zpětnou vazbu — sebehodnocení, nadřízený, podřízení a kolegové." : "My forms: give your feedback — self, manager (upward), reports (downward) and peers.",
    cs ? "Výsledky: anonymní souhrn zpětné vazby, kterou jste dostali." : "Results: the anonymized summary of feedback you received.",
  ];
  if (me.is_super_admin || me.role !== "ic")
    guide.push(cs ? "Přehled: kdo už odeslal, podle týmu nebo manažera." : "Report: who has submitted, by team or manager.");
  if (me.is_super_admin)
    guide.push(cs ? "Administrace: otevřít cyklus, nakreslit graf, publikovat výsledky." : "Admin: open a cycle, draw the feedback graph, publish results.");

  const statusMsg: Record<string, { text: string; cls: string; icon: IconName }> = {
    open: { text: cs ? "Sběr zpětné vazby probíhá — vyplňte své formuláře." : "Feedback is open — complete your forms.", cls: "bg-aqua/10 text-aqua-700", icon: "info" },
    closed: { text: cs ? "Sběr uzavřen. Souhrny teď připravuje AI." : "Collection closed. AI is now preparing the summaries.", cls: "bg-sun/20 text-ink", icon: "clock" },
    published: { text: cs ? "Výsledky jsou publikované — otevřete Výsledky." : "Results are published — open Results to see yours.", cls: "bg-mint-light text-aqua-700", icon: "check" },
  };
  const sMsg = cyc?.status ? statusMsg[cyc.status] : undefined;

  return (
    <>
      <AppHeader me={me} locale={locale} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t.hi}, {me.first_name}
              </h1>
              <p className="mt-1 text-sm text-ink-600">{cyc?.name ?? t.appName}</p>
            </div>
            {cyc?.status && (
              <Badge tone={statusTone}>
                <span className="capitalize">{cyc.status}</span>
              </Badge>
            )}
          </div>
          {total > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-ink-600">
                <span>{cs ? "Vaše formuláře" : "Your forms"}</span>
                <span>
                  {done}/{total}
                </span>
              </div>
              <ProgressBar value={done} max={total} tone={done === total ? "mint" : "aqua"} />
            </div>
          )}
          {sMsg && (
            <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${sMsg.cls}`}>
              <Icon name={sMsg.icon} size={16} />
              <span>{sMsg.text}</span>
            </div>
          )}
        </Card>

        <PageGuide
          id="dashboard"
          title={cs ? "Vítejte — co tu můžete dělat" : "Welcome — here's what you can do"}
          points={guide}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {tiles.map((tile) => (
            <Link
              key={tile.key}
              href={tile.href}
              className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06] transition hover:-translate-y-0.5 hover:shadow-md hover:ring-aqua/40"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-aqua/10 text-aqua">
                  <Icon name={tile.icon} size={22} />
                </span>
                {tile.badge && <Badge tone="sun">{tile.badge}</Badge>}
              </div>
              <div className="mt-3 flex items-center gap-1 font-medium text-ink">
                {tile.title}
                <Icon name="chevronRight" size={16} className="opacity-0 transition group-hover:opacity-60" />
              </div>
              <p className="text-sm text-ink-600">{tile.sub}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
