import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Card, PageHeader, Badge, EmptyState, cn } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SLICES = ["all", "self", "peer", "downward", "upward"] as const;
type Slice = (typeof SLICES)[number];

type Q = { id: string; text: string; category: string | null; type: string };
type Person = { id: string; first_name: string; last_name: string };
type ScaleRow = { q: Q; count: number; avg: number | null };
type TextRow = { response_id: string; question_id: string; text_value: string };
type ValueRow = {
  recipient_id: string;
  first_name: string;
  last_name: string;
  self_value: number | string | null;
  manager_value: number | string | null;
};

function barColor(pct: number): string {
  return pct >= 70 ? "#3f7178" : pct >= 40 ? "#deb869" : "#e0726a";
}

function sliceLabel(s: Slice, cs: boolean): string {
  const m: Record<Slice, [string, string]> = {
    all: ["All", "Vše"],
    self: ["Self", "Sebehodnocení"],
    peer: ["Peers", "Kolegové"],
    downward: ["From manager", "Od manažera"],
    upward: ["From reports", "Od podřízených"],
  };
  return cs ? m[s][1] : m[s][0];
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ recipient?: string; slice?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const t = dict[locale];
  const cs = locale === "cs";
  const sp = await searchParams;
  const target = sp.recipient || me.id;
  const slice: Slice = (SLICES as readonly string[]).includes(sp.slice ?? "") ? (sp.slice as Slice) : "all";

  const supabase = await createClient();
  const { data: peopleData } = await supabase.from("employees").select("id,first_name,last_name").order("last_name");
  const people = (peopleData ?? []) as Person[];
  const targetPerson = people.find((p) => p.id === target);

  const { data: qData } = await supabase.from("questions").select("id,text,category,type").eq("cycle_id", CYCLE).order("sort_order");
  const qmap = new Map(((qData ?? []) as Q[]).map((q) => [q.id, q]));
  const isScale = (q: Q | undefined) => !!q && (q.type === "scale_5" || q.type === "scale_10");

  let scaleRows: ScaleRow[] = [];
  let texts: TextRow[] = [];
  let valuePoints: { id: string; name: string; self: number; mgr: number }[] = [];
  let summary: { ai_summary: string | null; theme_tags: string[] | null } | null = null;

  if (slice === "self") {
    const { data } = await supabase
      .from("v_self_assessment")
      .select("question_id,scale_value,text_value")
      .eq("cycle_id", CYCLE)
      .eq("recipient_id", target);
    const rows = (data ?? []) as { question_id: string; scale_value: number | null; text_value: string | null }[];
    scaleRows = rows
      .map((r) => ({ q: qmap.get(r.question_id)!, count: 1, avg: r.scale_value == null ? null : Number(r.scale_value) }))
      .filter((r) => isScale(r.q) && r.avg != null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = rows
      .filter((r) => r.text_value && r.text_value.trim())
      .map((r) => ({ response_id: r.question_id, question_id: r.question_id, text_value: r.text_value as string }));
  } else if (slice === "all") {
    const [{ data: aggData }, { data: txtData }, { data: vmData }, { data: sumData }] = await Promise.all([
      supabase.from("v_received_aggregated").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", target),
      supabase.from("v_received_text_anon").select("response_id,question_id,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target),
      supabase.from("v_value_matrix").select("recipient_id,first_name,last_name,self_value,manager_value").eq("cycle_id", CYCLE),
      supabase.from("result_summaries").select("ai_summary,theme_tags").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("scope", "overall").maybeSingle(),
    ]);
    scaleRows = ((aggData ?? []) as { question_id: string; response_count: number; avg_scale: number | string | null }[])
      .map((a) => ({ q: qmap.get(a.question_id)!, count: a.response_count, avg: a.avg_scale == null ? null : Number(a.avg_scale) }))
      .filter((r) => isScale(r.q))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = (txtData ?? []) as TextRow[];
    valuePoints = ((vmData ?? []) as ValueRow[])
      .map((v) => ({ id: v.recipient_id, name: `${v.first_name} ${v.last_name}`, self: v.self_value == null ? null : Number(v.self_value), mgr: v.manager_value == null ? null : Number(v.manager_value) }))
      .filter((v): v is { id: string; name: string; self: number; mgr: number } => v.self != null && v.mgr != null);
    summary = sumData as { ai_summary: string | null; theme_tags: string[] | null } | null;
  } else {
    const [{ data: aggData }, { data: txtData }] = await Promise.all([
      supabase.from("v_received_aggregated_by_type").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("assignment_type", slice),
      supabase.from("v_received_text_by_type").select("response_id,question_id,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("assignment_type", slice),
    ]);
    scaleRows = ((aggData ?? []) as { question_id: string; response_count: number; avg_scale: number | string | null }[])
      .map((a) => ({ q: qmap.get(a.question_id)!, count: a.response_count, avg: a.avg_scale == null ? null : Number(a.avg_scale) }))
      .filter((r) => isScale(r.q))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = (txtData ?? []) as TextRow[];
  }

  const hasTargetData = scaleRows.length > 0 || texts.length > 0;
  const resGuide = [
    cs ? "Toto je zpětná vazba o vás — souhrnná a anonymní; zobrazí se až po dostatku odpovědí." : "This is feedback about you — aggregated and anonymized; it appears only once enough people respond.",
    cs ? "Přepínačem níže rozdělíte zpětnou vazbu podle zdroje (kolegové, manažer, podřízení, sebehodnocení)." : "Use the toggle below to break feedback down by source (peers, manager, reports, self).",
  ];
  if (me.is_super_admin || me.role !== "ic")
    resGuide.push(cs ? "Nahoře můžete přepnout, čí výsledky zobrazit." : "Use the selector at the top to view another person's results.");

  return (
    <>
      <AppHeader me={me} locale={locale} active="results" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title={t.results}
          subtitle={targetPerson && targetPerson.id !== me.id ? `${targetPerson.first_name} ${targetPerson.last_name}` : cs ? "Zpětná vazba, kterou jste dostali" : "Feedback you received"}
          action={
            people.length > 1 ? (
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="slice" value={slice} />
                <select name="recipient" defaultValue={target} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink focus:border-aqua focus:outline-none">
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.last_name}, {p.first_name}
                    </option>
                  ))}
                </select>
                <button className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90">{cs ? "Zobrazit" : "View"}</button>
              </form>
            ) : undefined
          }
        />

        <PageGuide id="results" title={cs ? "Jak číst výsledky" : "Reading your results"} points={resGuide} />

        {/* granularity toggle */}
        <div className="mb-6 flex flex-wrap gap-2">
          {SLICES.map((s) => (
            <Link
              key={s}
              href={`/results?recipient=${target}&slice=${s}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                slice === s ? "bg-ink text-white" : "bg-white text-ink-600 ring-1 ring-black/10 hover:text-ink",
              )}
            >
              {sliceLabel(s, cs)}
            </Link>
          ))}
        </div>

        {slice === "all" && valuePoints.length > 0 && (
          <Card className="mb-6">
            <ValueQuadrant points={valuePoints} targetId={target} locale={locale} />
          </Card>
        )}

        {slice === "all" && summary?.ai_summary && (
          <Card className="mb-6 bg-mint-light ring-mint">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-aqua-700">
              <Icon name="sparkles" size={16} /> {cs ? "AI shrnutí" : "AI summary"}
            </h2>
            <p className="text-sm text-ink">{summary.ai_summary}</p>
            {summary.theme_tags && summary.theme_tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {summary.theme_tags.map((tag) => (
                  <Badge key={tag} tone="aqua">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        )}

        {!hasTargetData && (
          <EmptyState
            icon={<Icon name="info" size={22} />}
            title={cs ? "Zatím nedostatek odpovědí" : "Not enough responses yet"}
            hint={
              slice === "all"
                ? cs
                  ? "Kvůli anonymitě se výsledky zobrazí po dosažení prahu, nebo po publikování cyklu."
                  : "Results appear once the anonymity threshold is met, or when the cycle is published."
                : cs
                  ? "V tomto pohledu není dost odpovědí k anonymnímu zobrazení."
                  : "Not enough responses in this view to show anonymously."
            }
          />
        )}

        {scaleRows.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
              {slice === "self" ? (cs ? "Vaše sebehodnocení" : "Your self-ratings") : cs ? "Hodnocení (průměr)" : "Ratings (average)"}
            </h2>
            <div className="space-y-3">
              {scaleRows.map(({ q, count, avg }) => {
                const max = q.type === "scale_10" ? 10 : 5;
                const pct = avg ? (avg / max) * 100 : 0;
                return (
                  <Card key={q.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3 text-sm">
                      <span className="text-ink">{q.text}</span>
                      <span className="whitespace-nowrap font-semibold text-ink">
                        {avg?.toFixed(1)} <span className="text-ink-600">/ {max}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/[0.07]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor(pct) }} />
                    </div>
                    <div className="mt-1.5 text-xs text-ink-600">
                      {slice === "self" ? (cs ? "sebehodnocení" : "self-assessment") : `${count} ${cs ? "odpovědí" : "responses"}`}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {texts.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">
              {slice === "self" ? (cs ? "Vaše odpovědi" : "Your answers") : cs ? "Komentáře (anonymní)" : "Comments (anonymized)"}
            </h2>
            <div className="space-y-2">
              {texts.map((tx) => (
                <Card key={tx.response_id} className="p-4">
                  <p className="text-sm italic text-ink">“{tx.text_value}”</p>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function ValueQuadrant({
  points,
  targetId,
  locale,
}: {
  points: { id: string; name: string; self: number; mgr: number }[];
  targetId: string;
  locale: "en" | "cs";
}) {
  const cs = locale === "cs";
  const S = 260;
  const PAD = 38;
  const W = S + PAD * 2;
  const px = (v: number) => PAD + ((v - 1) / 3) * S;
  const py = (v: number) => PAD + ((4 - v) / 3) * S;
  const jitter = (id: string) => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return (h / 997 - 0.5) * 0.3;
  };
  const mid = 2.5;
  return (
    <>
      <h2 className="mb-1 text-sm font-semibold text-ink">
        {cs ? "Hodnotová mapa" : "Value quadrant"} — {points.length} {cs ? "lidí" : "people"}
      </h2>
      <p className="mb-2 text-xs text-ink-600">{cs ? "x: sebehodnocení · y: hodnocení manažera (1 nízké – 4 vysoké)" : "x: self-rated · y: manager-rated (1 low – 4 high)"}</p>
      <svg viewBox={`0 0 ${W} ${W}`} className="mx-auto w-full max-w-md">
        <rect x={PAD} y={PAD} width={S} height={S} rx={10} fill="#f3f5f5" stroke="#e2e8e8" />
        <line x1={px(mid)} y1={PAD} x2={px(mid)} y2={PAD + S} stroke="#d7e0e0" strokeDasharray="4 4" />
        <line x1={PAD} y1={py(mid)} x2={PAD + S} y2={py(mid)} stroke="#d7e0e0" strokeDasharray="4 4" />
        <text x={PAD + 6} y={PAD + 15} fontSize="9" fill="#94a3b8">{cs ? "manažer cení víc" : "manager values more"}</text>
        <text x={PAD + S - 6} y={PAD + 15} fontSize="9" fill="#94a3b8" textAnchor="end">{cs ? "vysoce sladěno" : "aligned high"}</text>
        <text x={PAD + 6} y={PAD + S - 8} fontSize="9" fill="#94a3b8">{cs ? "nízce sladěno" : "aligned low"}</text>
        <text x={PAD + S - 6} y={PAD + S - 8} fontSize="9" fill="#94a3b8" textAnchor="end">{cs ? "sám cení víc" : "self values more"}</text>
        {points.map((p) => {
          const isT = p.id === targetId;
          return (
            <circle
              key={p.id}
              cx={px(Math.min(4, Math.max(1, p.self + jitter(p.id))))}
              cy={py(Math.min(4, Math.max(1, p.mgr + jitter(p.id + "y"))))}
              r={isT ? 6.5 : 3.5}
              fill={isT ? "#3f7178" : "#94a3b8"}
              fillOpacity={isT ? 1 : 0.55}
            >
              <title>{p.name}: self {p.self}, mgr {p.mgr}</title>
            </circle>
          );
        })}
      </svg>
    </>
  );
}
