#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * generate-questions-seed.ts — build supabase/seed_questions.sql.
 *
 * Creates a draft evaluation cycle and the 360 question bank (bilingual CS/EN).
 * Idempotent: upsert on (cycle_id, code). `text` = English (primary), `text_cs`
 * = Czech, `options` = jsonb [{value, en, cs}] for multi_choice + scale labels.
 *
 * NOTE: items 1–21 (behavioral + manager-eval) and the NPS item came with both
 * languages from the source doc. The Value statements, the two open-text prompts,
 * and the Value stems were ENGLISH-ONLY — their Czech here is a DRAFT translation
 * (marked below) and should be reviewed by a native speaker.
 *
 *   deno run --allow-read --allow-write scripts/generate-questions-seed.ts
 */

const OUT = Deno.args[0] ?? "supabase/seed_questions.sql";
const CYCLE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CYCLE_NAME = "360 Feedback — Hackathon (May 2026)";
const ADMIN_EMAIL = "rachel.green@fakeio.eu";

type Opt = { value: number; en: string; cs: string };
type Q = {
  code: string;
  type: "scale_5" | "scale_10" | "text" | "multi_choice";
  category: string;
  targets: string[];
  sort: number;
  required: boolean;
  en: string;
  cs: string | null;
  options?: Opt[];
};

// 5-point behavioral scale (higher = better). Bilingual labels from the doc.
const SCALE5: Opt[] = [
  { value: 5, en: "Always / almost always", cs: "Vždy / téměř vždy" },
  { value: 4, en: "Most of the time", cs: "Většinou" },
  { value: 3, en: "Sometimes", cs: "Někdy" },
  { value: 2, en: "Rarely", cs: "Zřídka" },
  { value: 1, en: "Never / almost never", cs: "Nikdy / téměř nikdy" },
];

// behavioral items 1–18 (peer/360): EN + CS both from the doc
const BEHAVIORAL: Array<{ en: string; cs: string }> = [
  { en: "Shares relevant information in a timely manner without needing to be asked.",
    cs: "Sdílí relevantní informace včas, aniž by bylo potřeba se doptávat." },
  { en: "When communicating with them, I know where I stand; they express themselves clearly and without unnecessary ambiguity.",
    cs: "V komunikaci s ním/ní vím, na čem jsem, vyjadřuje se jasně a bez zbytečných nejasností." },
  { en: "Listens actively to others and takes their perspective into account, even when it differs from his/her own.",
    cs: "Aktivně naslouchá ostatním a bere jejich pohled v úvahu, i když se liší od jeho/jejího vlastního." },
  { en: "Delivers results at the agreed-upon quality and by the promised deadline.",
    cs: "Dodává výstupy v dohodnuté kvalitě a ve slíbeném termínu." },
  { en: "When encountering a problem that threatens the outcome, he/she lets others know in advance, not at the last minute.",
    cs: "Když narazí na problém ohrožující výsledek, dá o tom vědět dopředu, ne na poslední chvíli." },
  { en: "Takes responsibility for the results of their work; when something goes wrong, they do not make excuses or shift blame onto others.",
    cs: "Přebírá odpovědnost za výsledky své práce, když se něco nepovede, nehledá výmluvy ani nepřesouvá zodpovědnost na ostatní." },
  { en: "When encountering a problem, considers multiple options and proposes a specific solution, not just a description of the situation.",
    cs: "Když narazí na problém, přijde zpravidla s konkrétním návrhem řešení, ne jen s popisem situace." },
  { en: "Contributes ideas and suggestions that provide real value to the team or project.",
    cs: "Přichází s nápady a návrhy, které mají reálný přínos pro tým nebo projekt." },
  { en: "Helps others even beyond the scope of their own tasks.",
    cs: "Pomáhá ostatním i nad rámec vlastních úkolů." },
  { en: "Responds to changes and unexpected situations flexibly, without unnecessary delay.",
    cs: "Reaguje na změny a nečekané situace pružně, bez zbytečného otálení." },
  { en: "Accepts critical feedback objectively and actively works with it, striving to improve.",
    cs: "Přijímá kritickou zpětnou vazbu věcně a aktivně s ní pracuje, snaží se zlepšovat." },
  { en: "Provides feedback to colleagues in a way that is both helpful and respectful.",
    cs: "Dává kolegům zpětnou vazbu způsobem, který je užitečný a zároveň respektující." },
  { en: "Voices a problem or concern openly, even when others disagree.",
    cs: "Pojmenuje problém nebo výhradu nahlas, i když ostatní mají jiný názor." },
  { en: "When things go wrong, faces the issue head-on and seeks solutions rather than excuses.",
    cs: "Když se něco nepovede, staví se k tomu čelem a hledá řešení místo výmluv." },
  { en: "Puts the team's success above personal recognition, shares credit and works together with others.",
    cs: "Staví úspěch týmu nad osobní zviditelnění, sdílí zásluhy a táhne za jeden provaz." },
  { en: "Treats others with respect, contributes to a psychologically safe environment, and creates an atmosphere where people aren't afraid to speak their minds or admit a mistake.",
    cs: "Jedná s respektem k druhým, přispívá k psychologicky bezpečnému prostředí, lidé se nebojí říct svůj názor nebo uznat chybu." },
  { en: "This colleague acts and delivers consistently across different situations (workload or changing circumstances) and under pressure. Their behaviour is predictably positive.",
    cs: "Jedná a podává konzistentní výkony v různých situacích (ať už jde o pracovní vytížení nebo měnící se okolnosti) i pod tlakem. Jeho chování je v pozitivním smyslu předvídatelné." },
  { en: "Acts fairly and maintains high ethical standards.",
    cs: "Jedná spravedlivě a dodržuje vysoké etické standardy." },
];

// manager-evaluation items 19–21 (upward): EN + CS both from the doc
const MANAGER: Array<{ en: string; cs: string }> = [
  { en: "I receive feedback from them that helps me grow, not just an evaluation, but specific guidance on what to improve.",
    cs: "Dostávám od něj/ní zpětnou vazbu, která mi pomáhá růst, nejen hodnocení, ale i konkrétní směr, co zlepšit." },
  { en: "They communicate information and make decisions in a timely and clear manner; they do not prolong uncertainty through unnecessary delays or vagueness.",
    cs: "Předává informace a přijímá rozhodnutí včas a srozumitelně, neprodlužuje nejistotu zbytečným odkládáním nebo mlžením." },
  { en: "They stand up for the team or an individual when needed, even against superiors or other teams.",
    cs: "Zastane se týmu nebo jednotlivce, když je to potřeba, i vůči nadřízeným nebo jiným týmům." },
];

const AS_ALL_OTHERS = ["upward", "downward", "peer"];

const defs: Q[] = [
  // Value quadrant — self (EN-only source; CS = DRAFT translation)
  {
    code: "value_self", type: "multi_choice", category: "value", targets: ["self"], sort: 1, required: true,
    en: "How valued and appreciated do you feel at work?",
    cs: "Jak oceňovaně a uznávaně se v práci cítíš?",
    options: [
      { value: 4, en: "I feel highly valued, trusted and appreciated by both my manager and the organization.",
        cs: "Cítím se velmi ceněný/á, mám důvěru a uznání jak od svého manažera, tak od firmy." },
      { value: 3, en: "I feel respected, but valuable, meaningful recognition and appreciation from my manager and/or the company is rare.",
        cs: "Cítím respekt, ale skutečné, smysluplné uznání a ocenění od manažera a/nebo firmy je vzácné." },
      { value: 2, en: "I feel rarely valued, but more often feel overlooked as neither my manager nor the company acknowledges my contributions.",
        cs: "Cítím se oceněný/á jen zřídka, častěji přehlížený/á – ani manažer, ani firma neuznávají můj přínos." },
      { value: 1, en: "I don't feel valued and appreciated by either my manager or the company.",
        cs: "Necítím se ceněný/á ani oceněný/á ze strany manažera ani firmy." },
    ],
  },
  // Value quadrant — manager about employee (EN-only source; CS = DRAFT)
  {
    code: "value_manager", type: "multi_choice", category: "value", targets: ["downward"], sort: 2, required: true,
    en: "How would you assess this person's value to the team and organization?",
    cs: "Jak hodnotíš přínos tohoto člověka pro tým a firmu?",
    options: [
      { value: 4, en: "This employee is highly valued, trusted, and critical to the team and organization, consistently delivering value, their departure would be a severe loss, and keeping them is a priority.",
        cs: "Tento člověk je velmi ceněný, má důvěru a je pro tým a firmu klíčový, soustavně přináší hodnotu; jeho odchod by byl vážnou ztrátou a jeho udržení je priorita." },
      { value: 3, en: "This employee is respected and reliable team member, brings solid value, meets performance goals, recognition is given, their departure would be a trouble and we don't want to loose them.",
        cs: "Tento člověk je respektovaný a spolehlivý člen týmu, přináší solidní hodnotu, plní cíle, dostává uznání; jeho odchod by byl problém a nechceme o něj přijít." },
      { value: 2, en: "This employee delivers limited value, inconsistent performance, and struggles to meet goals; their departure would be manageable, and I would not actively oppose or regret their exit.",
        cs: "Tento člověk přináší omezenou hodnotu, podává nekonzistentní výkon a má potíže plnit cíle; jeho odchod bychom zvládli a aktivně bych mu nebránil/a ani jej nelitoval/a." },
      { value: 1, en: "This employee is not performing or bringing any added value in their role, their departure would be acceptable or even beneficial for the team.",
        cs: "Tento člověk ve své roli nepodává výkon ani nepřináší žádnou přidanou hodnotu; jeho odchod by byl přijatelný, nebo dokonce přínosný pro tým." },
    ],
  },
  // NPS — both languages from the doc
  {
    code: "nps_future", type: "scale_10", category: "engagement", targets: AS_ALL_OTHERS, sort: 3, required: true,
    en: "How much do you look forward to working with this colleague on future projects or tasks?",
    cs: "Jak moc se těšíš na spolupráci s ním/ní na dalších projektech nebo úkolech?",
  },
  // Open text — EN-only source; CS = DRAFT translation
  {
    code: "text_strengths", type: "text", category: "strengths", targets: AS_ALL_OTHERS, sort: 4, required: false,
    en: "What strengths or skills do you value most in this colleague, and how do they help you or the team succeed?",
    cs: "Kterých silných stránek nebo dovedností si na tomto kolegovi/kolegyni ceníš nejvíce a jak pomáhají tobě nebo týmu k úspěchu?",
  },
  {
    code: "text_change", type: "text", category: "development", targets: AS_ALL_OTHERS, sort: 5, required: false,
    en: "What is one thing this colleague could change in their communication, daily habits, or ways of working to help you and the team collaborate even better?",
    cs: "Co jednoho by mohl/a tento kolega/kolegyně změnit ve své komunikaci, každodenních návycích nebo způsobu práce, aby se ti a týmu spolupracovalo ještě lépe?",
  },
];

// behavioral 1–18 (peer/360)
BEHAVIORAL.forEach((b, i) => {
  defs.push({
    code: `beh_${String(i + 1).padStart(2, "0")}`,
    type: "scale_5", category: "behavioral", targets: AS_ALL_OTHERS,
    sort: 10 + i, required: true, en: b.en, cs: b.cs, options: SCALE5,
  });
});

// manager-eval 19–21 (upward only)
MANAGER.forEach((m, i) => {
  defs.push({
    code: `mgr_${i + 19}`,
    type: "scale_5", category: "manager", targets: ["upward"],
    sort: 30 + i, required: true, en: m.en, cs: m.cs, options: SCALE5,
  });
});

// --- emit SQL ---------------------------------------------------------------
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qn = (s: string | null) => (s == null ? "null" : q(s));
const arr = (a: string[]) => `array[${a.map((x) => q(x)).join(",")}]::text[]`;
const jb = (o: unknown) => (o == null ? "null" : `${q(JSON.stringify(o))}::jsonb`);

const out: string[] = [];
out.push("-- supabase/seed_questions.sql — GENERATED by scripts/generate-questions-seed.ts.");
out.push("-- Bilingual 360 question bank. Idempotent upsert on (cycle_id, code).");
out.push("-- Czech for the Value statements / open-text prompts is a DRAFT translation — review.");
out.push("");
out.push("begin;");
out.push("");
out.push(`insert into public.evaluation_cycles (id, name, status, anon_min_responses, created_by)`);
out.push(`select ${q(CYCLE_ID)}, ${q(CYCLE_NAME)}, 'draft', 3, e.id`);
out.push(`from public.employees e where e.email = ${q(ADMIN_EMAIL)}`);
out.push(`on conflict (id) do nothing;`);
out.push("");
out.push("insert into public.questions");
out.push("  (cycle_id, code, text, text_cs, type, category, target_assignment_types, options, sort_order, is_required)");
out.push("values");
out.push(defs.map((d) =>
  `  (${q(CYCLE_ID)}, ${q(d.code)}, ${q(d.en)}, ${qn(d.cs)}, ${q(d.type)}, ${q(d.category)}, ` +
  `${arr(d.targets)}, ${jb(d.options ?? null)}, ${d.sort}, ${d.required})`
).join(",\n"));
out.push("on conflict (cycle_id, code) do update set");
out.push("  text = excluded.text, text_cs = excluded.text_cs, type = excluded.type,");
out.push("  category = excluded.category, target_assignment_types = excluded.target_assignment_types,");
out.push("  options = excluded.options, sort_order = excluded.sort_order, is_required = excluded.is_required;");
out.push("");
out.push("commit;");
out.push("");
await Deno.writeTextFile(OUT, out.join("\n"));

const byTarget = (t: string) => defs.filter((d) => d.targets.includes(t)).length;
console.log(`Wrote ${OUT}`);
console.log(`Cycle: ${CYCLE_NAME} (${CYCLE_ID})`);
console.log(`Questions: ${defs.length} — self=${byTarget("self")} upward=${byTarget("upward")} downward=${byTarget("downward")} peer=${byTarget("peer")}`);
console.log(`By type: ${["scale_5","scale_10","text","multi_choice"].map((t)=>`${t}=${defs.filter(d=>d.type===t).length}`).join(" ")}`);
