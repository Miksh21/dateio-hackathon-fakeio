import { Fragment } from "react";
import { cn } from "@/components/ui";

// Value & Visibility Matrix — manager's evaluation (columns, 1→4) × employee's
// self-evaluation (rows, top = high). Each (self, manager) score pair maps to one
// of 16 named cells. Replaces the old scatter "value quadrant": same data
// (v_value_matrix: self_value / manager_value, 1–4), richer read. Counts per cell
// show the distribution; the viewed person's cell is highlighted.

type Pt = { id: string; name: string; self: number; mgr: number };

// Columns = manager's evaluation, left→right = 1→4.
const COLS: { en: string; cs: string; descEn: string; descCs: string }[] = [
  { en: "NOT PERFORMING", cs: "NEVÝKONNÝ", descEn: "Not performing or bringing any added value, departure would be acceptable", descCs: "Nepodává výkon ani nepřináší přidanou hodnotu, odchod by byl přijatelný" },
  { en: "LIMITED VALUE", cs: "OMEZENÝ PŘÍNOS", descEn: "Delivers limited value, inconsistent performance, struggles to meet goals; departure is manageable", descCs: "Přináší omezenou hodnotu, nekonzistentní výkon, obtížně plní cíle; odchod je zvládnutelný" },
  { en: "RELIABLE CONTRIBUTOR", cs: "SPOLEHLIVÝ PŘISPĚVATEL", descEn: "Respected, reliable team member, brings solid value, meets performance goals, departure is trouble", descCs: "Respektovaný, spolehlivý člen týmu, přináší solidní hodnotu, plní cíle, odchod by byl problém" },
  { en: "CRITICAL TALENT", cs: "KLÍČOVÝ TALENT", descEn: "Highly valued, trusted, critical to the team and organization, departure would be a severe loss", descCs: "Vysoce ceněný, důvěryhodný, klíčový pro tým i organizaci, odchod by byl vážná ztráta" },
];

// Rows = employee's self-evaluation, top→bottom = high→low. Index 0 = self score 4.
const ROWS: { en: string; cs: string }[] = [
  { en: "I feel highly valued, trusted and appreciated by both my manager and the organization", cs: "Cítím se vysoce ceněný/á, mám důvěru a uznání od manažera i organizace" },
  { en: "I feel respected, but valuable, meaningful recognition and appreciation from my manager and/or the company is rare", cs: "Cítím se respektovaný/á, ale smysluplné uznání a ocenění od manažera a/nebo firmy je vzácné" },
  { en: "I feel rarely valued, but more often feel overlooked as neither my manager nor the company acknowledges my contributions", cs: "Cítím se málokdy ceněný/á, spíše přehlížený/á – ani manažer, ani firma neuznávají můj přínos" },
  { en: "I don't feel valued and appreciated by either my manager or the company", cs: "Necítím se ceněný/á ani oceňovaný/á manažerem ani firmou" },
];

// CELLS[row][col] — first line is the bold title, rest are bullets.
const CELLS_EN: string[][][] = [
  [
    ["Misaligned confidence", "Silent detachment", "Self-confidence without performance"],
    ["Higher self-worth than reality", "Overestimated contribution", "Frustration that recognition doesn't come"],
    ["Healthy engagement and high commitment, delivering results", "Feels appreciated and contributes reliably"],
    ["Mutual star, key talent, top performer, retention is key", "Strong mutual alignment, trust, recognition, and performance"],
  ],
  [
    ["Detached", "Feels okay but performance is weak", "Risk of low accountability"],
    ["Underperforming but stable", "Good performance without proper feedback", "Stable but average — delivers acceptable work without strong motivation"],
    ["Reliable but hidden contributor, balance of performance and satisfaction", "Often a silent driver of results, needs recognition"],
    ["Retention risk of a key contributor", "Reliable performer", "Highly valued but does not feel sufficiently recognized"],
  ],
  [
    ["Low trust, low motivation", "Both sides see the relationship negatively", "Low performance"],
    ["Low self-esteem, mutual doubts", "Feels undervalued while performance is inconsistent", "Requires clarity and direct feedback"],
    ["Undervalued performer", "Only the manager sees the potential", "Valuable employee who feels underappreciated", "High risk of frustration and disengagement"],
    ["Red flag, flight risk, key talent on the leaving block", "Hidden gem — manager appreciates, employee is skeptical and doesn't feel it"],
  ],
  [
    ["Critical mismatch", "Relationship in decline with low trust and low performance", "Low value, low performance"],
    ["Performance issue — employee is aware, but there is no improvement plan", "High risk of disengagement or resignation"],
    ["Invisible performer", "Capable contributor who feels unseen and frustrated"],
    ["Top red flag — severe retention risk", "Highly valued employee but feels unappreciated", "One of the highest retention risks"],
  ],
];

const CELLS_CS: string[][][] = [
  [
    ["Nesoulad v sebevědomí", "Tiché odpojení", "Sebevědomí bez výkonu"],
    ["Vyšší sebehodnocení než realita", "Přeceňovaný přínos", "Frustrace, že uznání nepřichází"],
    ["Zdravé zapojení a vysoký commitment, přináší výsledky", "Cítí se oceněný/á a spolehlivě přispívá"],
    ["Vzájemná hvězda, klíčový talent, top performer, udržení je klíčové", "Silné vzájemné sladění, důvěra, uznání a výkon"],
  ],
  [
    ["Odpojený/á", "Cítí se v pohodě, ale výkon je slabý", "Riziko nízké zodpovědnosti"],
    ["Podává podprůměr, ale stabilně", "Dobrý výkon bez řádné zpětné vazby", "Stabilní, ale průměrný — odvádí přijatelnou práci bez silné motivace"],
    ["Spolehlivý, ale skrytý přispěvatel, rovnováha výkonu a spokojenosti", "Často tichý hybatel výsledků, potřebuje uznání"],
    ["Riziko udržení klíčového přispěvatele", "Spolehlivý performer", "Vysoce ceněný/á, ale necítí dostatečné uznání"],
  ],
  [
    ["Nízká důvěra, nízká motivace", "Obě strany vnímají vztah negativně", "Nízký výkon"],
    ["Nízké sebevědomí, vzájemné pochybnosti", "Cítí se nedoceněný/á, výkon je nekonzistentní", "Vyžaduje jasnost a přímou zpětnou vazbu"],
    ["Nedoceněný performer", "Potenciál vidí jen manažer", "Hodnotný zaměstnanec, který se cítí nedoceněný/á", "Vysoké riziko frustrace a odpojení"],
    ["Červená vlajka, riziko odchodu, klíčový talent na odchodu", "Skrytý klenot — manažer oceňuje, zaměstnanec je skeptický a necítí to"],
  ],
  [
    ["Kritický nesoulad", "Vztah v úpadku, nízká důvěra a nízký výkon", "Nízká hodnota, nízký výkon"],
    ["Problém s výkonem — zaměstnanec si je vědom, ale není plán zlepšení", "Vysoké riziko odpojení nebo rezignace"],
    ["Neviditelný performer", "Schopný přispěvatel, který se cítí nevšímaný a frustrovaný"],
    ["Nejvyšší červená vlajka — vážné riziko odchodu", "Vysoce ceněný zaměstnanec, který se cítí nedoceněný/á", "Jedno z nejvyšších rizik udržení"],
  ],
];

// Quadrant colour: high self + low mgr = amber (over-confident); high self + high
// mgr = green (aligned high); low self + low mgr = rose (mutual low); low self +
// high mgr = sky (hidden value / retention risk).
function toneFor(r: number, c: number): keyof typeof TONE {
  const topHalf = r <= 1;
  const leftHalf = c <= 1;
  if (leftHalf) return topHalf ? "amber" : "rose";
  return topHalf ? "green" : "sky";
}
const TONE = {
  amber: "bg-[#fbf3d3]",
  green: "bg-[#e3f3e7]",
  sky: "bg-[#e2eefb]",
  rose: "bg-[#fbe3ec]",
} as const;

export function ValueMatrix({ points, targetId, locale }: { points: Pt[]; targetId: string; locale: "en" | "cs" }) {
  const cs = locale === "cs";
  const clamp = (v: number) => Math.min(4, Math.max(1, Math.round(v)));
  const rowOf = (self: number) => 4 - clamp(self); // self 4 → row 0 (top)
  const colOf = (mgr: number) => clamp(mgr) - 1; // mgr 1 → col 0 (left)

  const counts = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
  let target: { r: number; c: number; name: string } | null = null;
  for (const p of points) {
    const r = rowOf(p.self);
    const c = colOf(p.mgr);
    counts[r][c]++;
    if (p.id === targetId) target = { r, c, name: p.name };
  }
  const cells = cs ? CELLS_CS : CELLS_EN;

  return (
    <>
      <h2 className="mb-1 text-sm font-semibold text-ink">
        {cs ? "Matice hodnoty a viditelnosti" : "Value & Visibility Matrix"} — {points.length} {cs ? "lidí" : "people"}
      </h2>
      <p className="mb-3 text-xs text-ink-600">
        {cs ? "sloupce: hodnocení manažera · řádky: sebehodnocení (1 nízké – 4 vysoké)" : "columns: manager's evaluation · rows: employee's self-evaluation (1 low – 4 high)"}
        {target && ` · ${cs ? "vaše buňka zvýrazněna" : "your cell highlighted"}`}
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[880px] gap-1" style={{ gridTemplateColumns: "160px repeat(4, 1fr)" }}>
          {/* corner */}
          <div className="flex flex-col justify-end rounded-xl bg-ink p-3 text-white">
            <span className="text-xs font-bold leading-tight">{cs ? "Matice hodnoty a viditelnosti" : "Value & Visibility Matrix"}</span>
            <span className="mt-1.5 text-[10px] text-white/60">↓ {cs ? "sebehodnocení" : "self-evaluation"}</span>
            <span className="text-[10px] text-white/60">→ {cs ? "hodnocení manažera" : "manager's evaluation"}</span>
          </div>
          {/* column headers */}
          {COLS.map((col, c) => (
            <div key={c} className="rounded-xl bg-white p-2.5 ring-1 ring-black/[0.06]">
              <p className="text-[10px] leading-snug text-ink-600">{cs ? col.descCs : col.descEn}</p>
              <p className="mt-1.5 text-[11px] font-bold tracking-wide text-ink">{cs ? col.cs : col.en}</p>
            </div>
          ))}
          {/* body rows */}
          {ROWS.map((row, r) => (
            <Fragment key={r}>
              <div className="flex items-center rounded-xl bg-white p-2.5 text-[10px] leading-snug text-ink-600 ring-1 ring-black/[0.06]">
                {cs ? row.cs : row.en}
              </div>
              {[0, 1, 2, 3].map((c) => {
                const isTarget = target?.r === r && target?.c === c;
                const n = counts[r][c];
                return (
                  <div key={c} className={cn("relative rounded-xl p-2.5", TONE[toneFor(r, c)], isTarget && "ring-2 ring-aqua ring-offset-1")}>
                    {n > 0 && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white" title={cs ? `${n} lidí` : `${n} people`}>
                        {n}
                      </span>
                    )}
                    <ul className="space-y-1 pr-5">
                      {cells[r][c].map((line, i) => (
                        <li key={i} className={cn("text-[10px] leading-snug", i === 0 ? "font-semibold text-ink" : "text-ink-600")}>
                          {line}
                        </li>
                      ))}
                    </ul>
                    {isTarget && <p className="mt-1.5 text-[10px] font-bold text-aqua">← {target?.name}</p>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
