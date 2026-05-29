import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { dict, optLabel, assignmentTypeLabel } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Card, PageHeader, Badge, EmptyState, cn, type Tone } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PageGuide } from "@/components/PageGuide";
import { ReleaseToggle } from "@/components/ReleaseToggle";
import { ValueMatrix } from "@/components/ValueMatrix";

const CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SLICES = ["all", "self", "peer", "downward", "upward"] as const;
type Slice = (typeof SLICES)[number];
const MODES = ["received", "detailed", "given"] as const;
type Mode = (typeof MODES)[number];

type Opt = { value: number; en: string; cs: string | null };
type Q = { id: string; text: string; category: string | null; type: string; options: Opt[] | null };
type Person = { id: string; first_name: string; last_name: string };
type ScaleRow = { q: Q; count: number; avg: number | null };
type TextRow = { response_id: string; question_id: string; text_value: string };
type Ans = { scale_value: number | null; text_value: string | null; choice_value: string | null };
type GivenRow = Ans & { recipient_id: string; recipient_first_name: string; recipient_last_name: string; assignment_type: string; question_id: string; sort_order: number };
type RawRow = Ans & { giver_id: string; giver_first_name: string; giver_last_name: string; assignment_type: string; question_id: string; sort_order: number };
type ValueRow = { recipient_id: string; first_name: string; last_name: string; self_value: number | string | null; manager_value: number | string | null };

const TYPE_TONE: Record<string, Tone> = { self: "sky", upward: "lavender", downward: "pearl", peer: "mint" };

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
function modeLabel(m: Mode, cs: boolean): string {
  const x: Record<Mode, [string, string]> = {
    received: ["Received", "Přijatá"],
    detailed: ["Detailed", "Detailně"],
    given: ["Given", "Daná"],
  };
  return cs ? x[m][1] : x[m][0];
}
function answerText(q: Q | undefined, g: Ans, locale: "en" | "cs"): string {
  if (!q) return g.text_value ?? (g.scale_value != null ? String(g.scale_value) : "");
  if (q.type === "text") return g.text_value ?? "";
  if (q.type === "scale_10") return g.scale_value != null ? `${g.scale_value} / 10` : "—";
  const val = q.type === "multi_choice" ? g.choice_value : g.scale_value?.toString() ?? null;
  const opt = (q.options ?? []).find((o) => o.value.toString() === val);
  return opt ? optLabel(opt, locale) : val ?? "—";
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ recipient?: string; slice?: string; mode?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/");
  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const t = dict[locale];
  const cs = locale === "cs";
  const sp = await searchParams;
  const target = sp.recipient || me.id;
  const mode: Mode = (MODES as readonly string[]).includes(sp.mode ?? "") ? (sp.mode as Mode) : "received";
  const slice: Slice = (SLICES as readonly string[]).includes(sp.slice ?? "") ? (sp.slice as Slice) : "all";

  const supabase = await createClient();
  const { data: peopleData } = await supabase.from("employees").select("id,first_name,last_name").order("last_name");
  const people = (peopleData ?? []) as Person[];
  const targetPerson = people.find((p) => p.id === target);
  const isOwn = target === me.id;

  // release toggle (own results, only if you have reports)
  let hasReports = false;
  let myReleased = false;
  if (isOwn) {
    const [{ count }, { data: rel }] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("reporting_to_id", me.id).eq("is_active", true),
      supabase.from("feedback_releases").select("employee_id").eq("cycle_id", CYCLE).eq("employee_id", me.id).maybeSingle(),
    ]);
    hasReports = (count ?? 0) > 0;
    myReleased = !!rel;
  }

  const { data: qData } = await supabase.from("questions").select("id,text,category,type,options").eq("cycle_id", CYCLE).order("sort_order");
  const questions = (qData ?? []) as Q[];
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const isScale = (q: Q | undefined) => !!q && (q.type === "scale_5" || q.type === "scale_10");

  let scaleRows: ScaleRow[] = [];
  let texts: TextRow[] = [];
  let valuePoints: { id: string; name: string; self: number; mgr: number }[] = [];
  let summary: { ai_summary: string | null; theme_tags: string[] | null } | null = null;
  let given: GivenRow[] = [];
  let raw: RawRow[] = [];

  if (mode === "given") {
    const { data } = await supabase
      .from("v_given")
      .select("recipient_id,recipient_first_name,recipient_last_name,assignment_type,question_id,scale_value,text_value,choice_value,sort_order")
      .eq("cycle_id", CYCLE)
      .eq("from_id", target)
      .order("sort_order");
    given = (data ?? []) as GivenRow[];
  } else if (mode === "detailed") {
    const { data } = await supabase
      .from("v_received_raw")
      .select("giver_id,giver_first_name,giver_last_name,assignment_type,question_id,scale_value,text_value,choice_value,sort_order")
      .eq("cycle_id", CYCLE)
      .eq("recipient_id", target)
      .order("sort_order");
    raw = (data ?? []) as RawRow[];
  } else if (slice === "self") {
    const { data } = await supabase.from("v_self_assessment").select("question_id,scale_value,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target);
    const rows = (data ?? []) as { question_id: string; scale_value: number | null; text_value: string | null }[];
    scaleRows = rows.map((r) => ({ q: qmap.get(r.question_id)!, count: 1, avg: r.scale_value == null ? null : Number(r.scale_value) })).filter((r) => isScale(r.q) && r.avg != null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = rows.filter((r) => r.text_value && r.text_value.trim()).map((r) => ({ response_id: r.question_id, question_id: r.question_id, text_value: r.text_value as string }));
  } else if (slice === "all") {
    const [{ data: aggData }, { data: txtData }, { data: vmData }, { data: sumData }] = await Promise.all([
      supabase.from("v_received_aggregated").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", target),
      supabase.from("v_received_text_anon").select("response_id,question_id,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target),
      supabase.from("v_value_matrix").select("recipient_id,first_name,last_name,self_value,manager_value").eq("cycle_id", CYCLE),
      supabase.from("result_summaries").select("ai_summary,theme_tags").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("scope", "overall").maybeSingle(),
    ]);
    scaleRows = ((aggData ?? []) as { question_id: string; response_count: number; avg_scale: number | string | null }[]).map((a) => ({ q: qmap.get(a.question_id)!, count: a.response_count, avg: a.avg_scale == null ? null : Number(a.avg_scale) })).filter((r) => isScale(r.q)).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = (txtData ?? []) as TextRow[];
    valuePoints = ((vmData ?? []) as ValueRow[]).map((v) => ({ id: v.recipient_id, name: `${v.first_name} ${v.last_name}`, self: v.self_value == null ? null : Number(v.self_value), mgr: v.manager_value == null ? null : Number(v.manager_value) })).filter((v): v is { id: string; name: string; self: number; mgr: number } => v.self != null && v.mgr != null);
    summary = sumData as { ai_summary: string | null; theme_tags: string[] | null } | null;
  } else {
    const [{ data: aggData }, { data: txtData }] = await Promise.all([
      supabase.from("v_received_aggregated_by_type").select("question_id,response_count,avg_scale").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("assignment_type", slice),
      supabase.from("v_received_text_by_type").select("response_id,question_id,text_value").eq("cycle_id", CYCLE).eq("recipient_id", target).eq("assignment_type", slice),
    ]);
    scaleRows = ((aggData ?? []) as { question_id: string; response_count: number; avg_scale: number | string | null }[]).map((a) => ({ q: qmap.get(a.question_id)!, count: a.response_count, avg: a.avg_scale == null ? null : Number(a.avg_scale) })).filter((r) => isScale(r.q)).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    texts = (txtData ?? []) as TextRow[];
  }

  const group = <T extends { question_id: string }>(rows: T[], keyOf: (r: T) => string, nameOf: (r: T) => string, typeOf: (r: T) => string) =>
    [...rows.reduce((m, r) => {
      const e = m.get(keyOf(r)) ?? { name: nameOf(r), type: typeOf(r), rows: [] as T[] };
      e.rows.push(r);
      m.set(keyOf(r), e);
      return m;
    }, new Map<string, { name: string; type: string; rows: T[] }>()).values()];

  const givenGroups = group(given, (g) => g.recipient_id, (g) => `${g.recipient_last_name}, ${g.recipient_first_name}`, (g) => g.assignment_type);
  const rawGroups = group(raw, (g) => g.giver_id, (g) => `${g.giver_last_name}, ${g.giver_first_name}`, (g) => g.assignment_type);

  const hasReceived = scaleRows.length > 0 || texts.length > 0;
  const resGuide = [
    cs ? "Přijatá je souhrnná a anonymní; Detailně ukazuje, kdo co řekl (jen pro podřízené po uvolnění manažerem); Daná jsou vlastní odpovědi." : "Received is aggregated and anonymized; Detailed shows who said what (for reports, after the manager releases); Given is the person's own answers.",
    cs ? "U Přijaté rozdělte zpětnou vazbu podle zdroje." : "Under Received, break feedback down by source.",
  ];
  if (me.is_super_admin || me.role !== "ic") resGuide.push(cs ? "Nahoře můžete přepnout, čí výsledky zobrazit." : "Use the selector at the top to view another person.");

  const modeHref = (m: Mode) => `/results?recipient=${target}&mode=${m}${m === "received" ? `&slice=${slice}` : ""}`;

  return (
    <>
      <AppHeader me={me} locale={locale} active="results" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title={t.results}
          subtitle={targetPerson && !isOwn ? `${targetPerson.first_name} ${targetPerson.last_name}` : cs ? "Vaše zpětná vazba" : "Your feedback"}
          action={
            people.length > 1 ? (
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="mode" value={mode} />
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

        {isOwn && hasReports && <ReleaseToggle cycleId={CYCLE} employeeId={me.id} released={myReleased} locale={locale} />}

        <div className="mb-4 inline-flex rounded-xl bg-black/[0.04] p-1">
          {MODES.map((m) => (
            <Link key={m} href={modeHref(m)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium transition", mode === m ? "bg-white text-ink shadow-sm" : "text-ink-600 hover:text-ink")}>
              {modeLabel(m, cs)}
            </Link>
          ))}
        </div>

        {mode === "received" && (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {SLICES.map((s) => (
                <Link key={s} href={`/results?recipient=${target}&mode=received&slice=${s}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", slice === s ? "bg-ink text-white" : "bg-white text-ink-600 ring-1 ring-black/10 hover:text-ink")}>
                  {sliceLabel(s, cs)}
                </Link>
              ))}
            </div>

            {slice === "all" && valuePoints.length > 0 && (
              <Card className="mb-6">
                <ValueMatrix points={valuePoints} targetId={target} locale={locale} />
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

            {!hasReceived && (
              <EmptyState
                icon={<Icon name="info" size={22} />}
                title={cs ? "Zatím nedostatek odpovědí" : "Not enough responses yet"}
                hint={slice === "all" ? (cs ? "Kvůli anonymitě se výsledky zobrazí po dosažení prahu nebo po publikování." : "Results appear once the anonymity threshold is met, or when the cycle is published.") : cs ? "V tomto pohledu není dost odpovědí k anonymnímu zobrazení." : "Not enough responses in this view to show anonymously."}
              />
            )}

            {scaleRows.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">{slice === "self" ? (cs ? "Vaše sebehodnocení" : "Self-ratings") : cs ? "Hodnocení (průměr)" : "Ratings (average)"}</h2>
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
                        <div className="mt-1.5 text-xs text-ink-600">{slice === "self" ? (cs ? "sebehodnocení" : "self-assessment") : `${count} ${cs ? "odpovědí" : "responses"}`}</div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {texts.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-600">{slice === "self" ? (cs ? "Vaše odpovědi" : "Your answers") : cs ? "Komentáře (anonymní)" : "Comments (anonymized)"}</h2>
                <div className="space-y-2">
                  {texts.map((tx) => (
                    <Card key={tx.response_id} className="p-4">
                      <p className="text-sm italic text-ink">“{tx.text_value}”</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {mode === "detailed" &&
          (rawGroups.length === 0 ? (
            <EmptyState
              icon={<Icon name="info" size={22} />}
              title={cs ? "Žádná detailní zpětná vazba" : "No detailed feedback here"}
              hint={cs ? "Detailní (neanonymní) zpětnou vazbu vidí jen podřízení dané osoby — a jen poté, co ji daná osoba uvolní a cyklus je publikován." : "The detailed (named) view is only available to a person's reports — and only after that person releases it and the cycle is published."}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-ink-600">{cs ? "Neanonymní — kdo co řekl." : "Named — who said what."}</p>
              {rawGroups.map((grp) => (
                <Card key={grp.name} className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-medium text-ink">{grp.name}</span>
                    <Badge tone={TYPE_TONE[grp.type] ?? "neutral"}>{assignmentTypeLabel(grp.type, locale)}</Badge>
                  </div>
                  <ul className="space-y-2.5">
                    {grp.rows.map((g) => {
                      const q = qmap.get(g.question_id);
                      return (
                        <li key={g.question_id} className="text-sm">
                          <div className="text-ink-600">{q?.text ?? g.question_id}</div>
                          <div className="font-medium text-ink">{answerText(q, g, locale)}</div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          ))}

        {mode === "given" &&
          (givenGroups.length === 0 ? (
            <EmptyState
              icon={<Icon name="info" size={22} />}
              title={cs ? "Žádná daná zpětná vazba" : "No given feedback"}
              hint={cs ? "Tato osoba zatím nic neodeslala, nebo na to nemáte oprávnění." : "This person hasn't submitted anything yet, or you don't have permission to view it."}
            />
          ) : (
            <div className="space-y-4">
              {givenGroups.map((grp) => (
                <Card key={grp.name} className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-medium text-ink">{grp.name}</span>
                    <Badge tone={TYPE_TONE[grp.type] ?? "neutral"}>{assignmentTypeLabel(grp.type, locale)}</Badge>
                  </div>
                  <ul className="space-y-2.5">
                    {grp.rows.map((g) => {
                      const q = qmap.get(g.question_id);
                      return (
                        <li key={g.question_id} className="text-sm">
                          <div className="text-ink-600">{q?.text ?? g.question_id}</div>
                          <div className="font-medium text-ink">{answerText(q, g, locale)}</div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          ))}
      </main>
    </>
  );
}

