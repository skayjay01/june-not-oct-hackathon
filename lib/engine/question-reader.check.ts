// Self-check for the question reader (A3). No AI account needed: the AI is faked.
// Run: npx tsx lib/engine/question-reader.check.ts  (exits 1 on any problem)
//
// Covers the A3 "done when": 5 demo questions + 5 off-topic questions are handled
// correctly by the keyword fallback, and any AI output is cleaned into a valid intent.

import { checkIntent, loadQuestionVocab, normalizeIntent, readByKeywords, readQuestion, refineByKeywords, type AskJson, type QuestionVocab } from "./question-reader";

// Small stand-in for data/curation until Blair's lists are merged.
const fallbackVocab: QuestionVocab = {
  styleTags: [
    { id: "quiet-luxury", label: "Quiet luxury" },
    { id: "y2k", label: "Y2K" },
    { id: "boho", label: "Boho" },
    { id: "coastal", label: "Coastal" },
  ],
  categories: [
    { id: "dresses", label: "Dresses" },
    { id: "tops", label: "Tops & blouses" },
    { id: "jeans", label: "Jeans" },
    { id: "knitwear", label: "Knitwear" },
    { id: "skirts", label: "Skirts" },
  ],
  colors: [
    { id: "butter-yellow", label: "Butter yellow" },
    { id: "cloud-dancer", label: "Cloud Dancer" },
  ],
};
const loaded = loadQuestionVocab();
const vocab = loaded.categories.length ? loaded : fallbackVocab;
const opts = { vocab, profile: { categories: ["dresses"], style_tags: [], price_max: 120 } };

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

// 1. Demo-style questions → in scope, with the right fields picked out.
const demo: [string, Partial<{ categories: string[]; style_tags: string[]; price_min: number | null; price_max: number | null; focus: string; time_window_days: number }>][] = [
  ["Which colors are gaining traction in summer dresses under $50?", { categories: ["dresses"], price_max: 50, focus: "color" }],
  ["What denim silhouettes are rising for jeans in the last 6 months?", { categories: ["jeans"], focus: "silhouette", time_window_days: 180 }],
  ["Top quiet luxury knitwear materials between $80 and $200", { categories: ["knitwear"], style_tags: ["quiet-luxury"], price_min: 80, price_max: 200, focus: "material" }],
  ["Which prints are trending in boho skirts this month?", { categories: ["skirts"], style_tags: ["boho"], focus: "pattern", time_window_days: 30 }],
  ["Is butter yellow still popular?", { focus: "color" }],
];
for (const [q, want] of demo) {
  const got = readByKeywords(q, opts);
  const diffs = Object.entries(want).filter(([k, v]) => JSON.stringify(got[k as keyof typeof got]) !== JSON.stringify(v));
  expect(`demo: ${q}`, got.in_scope && diffs.length === 0 && checkIntent(got, vocab).length === 0, JSON.stringify({ diffs, got }));
}

// 1b. Blair's demo questions (data/curation/demo-set.md) stay in scope even without the AI.
const blairDemo: [string, string][] = [
  ["Should our spring 2027 dresses lean green or orange?", "color"],
  ["Is butter yellow still rising, or has it peaked?", "color"],
  ["Which prints should we add for fall?", "pattern"],
  ["Is preppy tailoring coming back for spring 2027?", "general"],
  ["How big is the sports-merch moment, and should we do a team collab?", "general"],
];
for (const [q, focus] of blairDemo) {
  const got = readByKeywords(q, opts);
  expect(`demo-set: ${q}`, got.in_scope && got.focus === focus && checkIntent(got, vocab).length === 0, JSON.stringify(got));
}

// 2. Off-topic or unsupported → out of scope with a suggestion.
const offTopic = [
  "What's the weather in Boston tomorrow?",
  "How do I fix a TypeScript build error?",
  "Forecast our dress sales for next year",
  "Design me a logo for my brand",
  "What is Zara's revenue this quarter?",
];
for (const q of offTopic) {
  const got = readByKeywords(q, opts);
  expect(`off-topic: ${q}`, !got.in_scope && !!got.suggestion, JSON.stringify(got));
}
expect("off-topic suggestion uses the brand's category and price", readByKeywords("hello", opts).suggestion === "Which colors are gaining traction in dresses under $120?", String(readByKeywords("hello", opts).suggestion));

// 3. Messy AI output is cleaned: labels → ids, unknown ids dropped, numbers made sane.
const messy = normalizeIntent(
  { in_scope: true, suggestion: "x", style_tags: ["Y2K", "not-a-tag"], categories: ["DRESSES", "dresses", "socks"], price_min: "120", price_max: 40, focus: "vibes", emphasis: ["growth_speed", "nonsense", "growth_speed"], time_window_days: 5000 },
  opts,
);
expect("normalize: labels mapped, unknowns dropped", JSON.stringify([messy.style_tags, messy.categories]) === JSON.stringify([["y2k"], ["dresses"]]), JSON.stringify(messy));
expect("normalize: prices swapped into order", messy.price_min === 40 && messy.price_max === 120, JSON.stringify(messy));
expect("normalize: bad focus → general, emphasis deduped", messy.focus === "general" && JSON.stringify(messy.emphasis) === '["growth_speed"]', JSON.stringify(messy));
expect("normalize: window clamped", messy.time_window_days === 730, String(messy.time_window_days));
expect("normalize: in-scope clears suggestion", messy.suggestion === null);
const outNoSuggestion = normalizeIntent({ in_scope: false, suggestion: "" }, opts);
expect("normalize: out-of-scope always gets a suggestion", !outNoSuggestion.in_scope && !!outNoSuggestion.suggestion, JSON.stringify(outNoSuggestion));
const withAside = normalizeIntent({ in_scope: false, suggestion: "x", aside: " Gift shopping? We do trends. " }, opts);
expect("normalize: out-of-scope keeps the AI's aside", withAside.aside === "Gift shopping? We do trends.", JSON.stringify(withAside));
expect("normalize: overlong aside dropped", normalizeIntent({ in_scope: false, suggestion: "x", aside: "a".repeat(300) }, opts).aside === null);
expect("normalize: garbage input still valid", checkIntent(normalizeIntent(null, opts), vocab).length === 0);

// 3b. Follow-ups (US-009) without the AI: start from the earlier reading, change only what's stated.
const base = readByKeywords("Which colors are gaining traction in dresses under $50 this month?", opts);
const cheaper = refineByKeywords("only under $30", base, opts);
expect("follow-up: new price replaces old, rest kept", cheaper.in_scope && cheaper.price_max === 30 && cheaper.categories.join() === "dresses" && cheaper.focus === "color" && cheaper.time_window_days === 30, JSON.stringify(cheaper));
const skirts = refineByKeywords("what about skirts?", base, opts);
expect("follow-up: new category replaces old, price kept", skirts.categories.join() === "skirts" && skirts.price_max === 50, JSON.stringify(skirts));
const longer = refineByKeywords("and over the last 6 months", base, opts);
expect("follow-up: window changed only when stated", longer.time_window_days === 180 && refineByKeywords("ok", base, opts).time_window_days === 30, JSON.stringify(longer));
const off = refineByKeywords("forecast our sales next year", base, opts);
expect("follow-up: unsupported ask still refused", !off.in_scope && !!off.suggestion, JSON.stringify(off));
expect("follow-up: of an off-topic question is refused", !refineByKeywords("only under $30", readByKeywords("weather in Boston?", opts), opts).in_scope);

// 4. readQuestion: AI path, AI failure → keywords, and input limits.
const fakeAsk: AskJson = async (req) => {
  if (req.step !== "interpret" || req.schemaName !== "question_intent" || !req.system.includes("dresses")) throw new Error("bad request shape");
  return { in_scope: true, suggestion: null, style_tags: [], categories: ["dresses"], price_min: null, price_max: 50, focus: "color", emphasis: [], time_window_days: 90 };
};
const failingAsk: AskJson = async () => {
  throw new Error("all AI accounts exhausted");
};
const main = async () => {
  const viaAi = await readQuestion("Which colors are gaining traction in summer dresses under $50?", { ...opts, ask: fakeAsk });
  expect("readQuestion: uses the AI answer", viaAi.via === "ai" && viaAi.intent.price_max === 50, JSON.stringify(viaAi));
  const viaKeywords = await readQuestion("Which colors are gaining traction in summer dresses under $50?", { ...opts, ask: failingAsk });
  expect("readQuestion: AI failure falls back to keywords", viaKeywords.via === "keywords" && viaKeywords.intent.in_scope && viaKeywords.intent.price_max === 50, JSON.stringify(viaKeywords));
  let seen = { system: "", prompt: "" };
  const spyAsk: AskJson = async (req) => {
    seen = { system: req.system, prompt: req.prompt };
    throw new Error("down");
  };
  const fu = await readQuestion("only under $30", { ...opts, ask: spyAsk, previous: { question: "Colors in dresses?", intent: base } });
  expect("readQuestion follow-up: AI sees the earlier question and the follow-up rule", seen.prompt.includes("Earlier question: Colors in dresses?") && seen.prompt.includes("Follow-up: only under $30") && seen.system.includes("refining an earlier question"), JSON.stringify(seen).slice(0, 300));
  expect("readQuestion follow-up: AI failure refines by keywords", fu.via === "keywords" && fu.intent.in_scope && fu.intent.price_max === 30 && fu.intent.categories.join() === "dresses", JSON.stringify(fu));
  const tooLong = await readQuestion("x".repeat(501), { ...opts, ask: fakeAsk });
  expect("readQuestion: over 500 characters refused politely", !tooLong.intent.in_scope && /500/.test(tooLong.intent.suggestion ?? ""), JSON.stringify(tooLong));
  const empty = await readQuestion("   ", { ...opts, ask: fakeAsk });
  expect("readQuestion: empty question refused politely", !empty.intent.in_scope && !!empty.intent.suggestion);

  console.log(vocab === loaded ? "vocab: data/curation" : "vocab: built-in stand-in (data/curation not merged yet)");
  process.exit(bad ? 1 : 0);
};
main();
