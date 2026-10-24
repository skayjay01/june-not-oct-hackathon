// Self-check for the dashboard builder (A5). No AI or database: both are faked.
// Run: npx tsx lib/engine/dashboard-builder.check.ts  (exits 1 on any problem)
//
// Covers the A5 "done when": 5 demo questions produce valid specs, and events stream
// widget by widget. Also: AI failures fall back, cache replays, out-of-scope and no-data notices.

import { DEMO_BRAND_ID, sampleBrandProfile, sampleWeights } from "../contracts/fixtures";
import type { DashboardEvent, DashboardSpec, TrendItem } from "../contracts/types";
import { answerQuestion, checkSpec, questionHash, repairPlan, type AskCall, type AskStep, type DashboardDeps } from "./dashboard-builder";
import { readByKeywords, type QuestionVocab } from "./question-reader";

const NOW = new Date("2026-10-24T12:00:00Z");
let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

const vocab: QuestionVocab = {
  styleTags: [{ id: "minimalist", label: "Minimalist" }, { id: "y2k", label: "Y2K" }, { id: "quiet-luxury", label: "Quiet luxury" }, { id: "boho", label: "Boho" }],
  categories: [{ id: "dresses", label: "Dresses" }, { id: "jeans", label: "Jeans" }, { id: "knitwear", label: "Knitwear" }, { id: "skirts", label: "Skirts" }, { id: "tops", label: "Tops & blouses" }],
  colors: [{ id: "butter-yellow", label: "Butter yellow" }, { id: "cherry-red", label: "Cherry red" }, { id: "cloud-dancer", label: "Cloud Dancer" }],
};

// A small library: products across categories, colors, silhouettes, materials, patterns; plus keywords.
let nextId = 1;
const product = (category: string, color: string, extra: Partial<TrendItem["attributes"]>, price: number, growth: number, stores: number): TrendItem => {
  const id = nextId++;
  return {
    id, source: "shopify_products", source_item_id: `p${id}`, brand_id: null, type: "product", title: `${color} ${category} ${id}`, category,
    attributes: { colors: [color], ...extra }, price, currency: "USD", image_url: `https://placehold.co/400x500?text=${id}`, link: `https://shop${id % 5}.example.com/p/${id}`,
    metrics: { growth, store_count: stores, search_interest: Math.round(growth * 50) }, published_at: "2026-10-01T00:00:00Z", collected_at: "2026-10-20T00:00:00Z",
  };
};
const items: TrendItem[] = [
  product("dresses", "butter-yellow", { silhouette: "a-line", material: "linen", style_tags: ["minimalist"] }, 45, 0.6, 12),
  product("dresses", "cherry-red", { silhouette: "slip", material: "satin", style_tags: ["y2k"] }, 38, 0.3, 20),
  product("dresses", "cloud-dancer", { silhouette: "column", material: "poplin", style_tags: ["quiet-luxury"] }, 120, 0.4, 4),
  product("dresses", "butter-yellow", { silhouette: "wrap", material: "linen", pattern: "gingham", style_tags: ["boho"] }, 49, 0.8, 7),
  product("jeans", "cloud-dancer", { silhouette: "barrel", material: "denim", style_tags: ["minimalist"] }, 90, 0.9, 15),
  product("jeans", "cherry-red", { silhouette: "wide-leg", material: "denim", style_tags: ["y2k"] }, 70, 0.5, 9),
  product("knitwear", "cloud-dancer", { material: "cashmere", style_tags: ["quiet-luxury"] }, 160, 0.35, 6),
  product("knitwear", "butter-yellow", { material: "merino", style_tags: ["quiet-luxury", "minimalist"] }, 110, 0.45, 8),
  product("skirts", "cherry-red", { pattern: "floral", silhouette: "midi", style_tags: ["boho"] }, 55, 0.7, 10),
  product("skirts", "butter-yellow", { pattern: "paisley", silhouette: "maxi", style_tags: ["boho"] }, 65, 0.4, 5),
  {
    id: 99, source: "google_trends", source_item_id: "kw-butter-yellow", brand_id: null, type: "keyword", title: "butter yellow", category: null, attributes: { colors: ["butter-yellow"] },
    price: null, currency: null, image_url: null, link: null, published_at: null, collected_at: "2026-10-20T00:00:00Z",
    metrics: { search_interest: 80, series: [{ date: "2026-08-01", value: 40 }, { date: "2026-09-01", value: 62 }, { date: "2026-10-01", value: 80 }] },
  },
];

/** Fake AI that answers like a model would: the reader via keywords, a sensible plan, a summary. */
const goodAsk: AskStep = async <T,>(c: AskCall<T>): Promise<T> => {
  if (c.step === "interpret") return readByKeywords(c.prompt, { vocab }) as T;
  if (c.step === "assemble") {
    const plan = {
      title: "What's rising",
      widgets: [
        { id: "colors", chart: "color_swatches", query: "attribute_growth", title: "Rising colors", caption: "Colors with the strongest signals.", attribute: "colors", keywords: [], limit: 6 },
        { id: "examples", chart: "image_grid", query: "top_examples", title: "Top examples", caption: "Best-matching products.", attribute: null, keywords: [], limit: 6 },
        { id: "count", chart: "big_number", query: "item_count", title: "Matching products", caption: "How many we found.", attribute: null, keywords: [], limit: 3 },
        { id: "search", chart: "trend_line", query: "interest_over_time", title: "Search interest", caption: "Searches over time.", attribute: null, keywords: ["butter yellow"], limit: 3 },
      ],
    };
    if (c.validate && c.validate(plan as T).length) throw new Error("plan failed validation");
    return plan as T;
  }
  return { summary: "Butter yellow leads the rising colors, backed by real products across several stores. Consider testing it in your next drop." } as T;
};
const deadAsk: AskStep = async () => {
  throw new Error("All AI accounts failed");
};

const store = new Map<string, DashboardSpec>();
const timings: string[] = [];
const deps = (ask: AskStep, extra: Partial<DashboardDeps> = {}): DashboardDeps => ({
  ask, vocab, now: () => NOW,
  loadBrand: async () => ({ profile: sampleBrandProfile, weights: sampleWeights }),
  loadItems: async () => items,
  cache: { get: async (h) => store.get(h) ?? null, set: async (h, _q, s) => void store.set(h, s) },
  logTiming: (e) => void timings.push(e.step),
  sourceNames: { shopify_products: "Store product lists", google_trends: "Google Trends" },
  queryOptions: { colorHex: { "butter-yellow": "#F3E3A0" } },
  ...extra,
});

async function run(question: string, d: DashboardDeps): Promise<DashboardEvent[]> {
  const out: DashboardEvent[] = [];
  for await (const e of answerQuestion(DEMO_BRAND_ID, question, d)) out.push(e);
  return out;
}
const final = (ev: DashboardEvent[]) => ev.find((e): e is Extract<DashboardEvent, { type: "done" }> => e.type === "done");

const demoQuestions = [
  "Which colors are gaining traction in summer dresses under $50?",
  "What denim silhouettes are rising for jeans in the last 6 months?",
  "Top quiet luxury knitwear materials between $80 and $200",
  "Which prints are trending in boho skirts this month?",
  "Is butter yellow still popular?",
];

const main = async () => {
  // 1. Demo questions → valid, streamed specs, with a working AI and with every AI call failing.
  for (const [label, ask] of [["AI", goodAsk], ["no AI", deadAsk]] as const) {
    for (const q of demoQuestions) {
      store.clear();
      const ev = await run(q, deps(ask));
      const done = final(ev);
      const spec = done?.spec;
      const types = ev.map((e) => e.type);
      const streamed = types[0] === "plan" && types.filter((t) => t === "widget").length === spec?.widgets.length && types.at(-1) === "done";
      const footers = !!spec?.widgets.every((w) => w.source && w.date_range && w.rows?.length && w.unit);
      const errs = spec ? checkSpec(spec) : ["no spec"];
      expect(`${label}: ${q}`, !!spec && !spec.notice && errs.length === 0 && streamed && footers && !!spec.summary,
        JSON.stringify({ errs, types, notice: spec?.notice, widgets: spec?.widgets.map((w) => [w.id, w.chart, w.rows?.length]) }));
    }
  }

  // 1b. Widgets show vocabulary labels, and trend lines date-range over their own points.
  store.clear();
  const spec1 = final(await run(demoQuestions[0], deps(goodAsk)))!.spec;
  const swatch = spec1.widgets.find((w) => w.chart === "color_swatches");
  const line = spec1.widgets.find((w) => w.chart === "trend_line");
  expect("labels: swatches show color names, not ids", !!swatch?.rows?.some((r) => r.label === "Butter yellow" && r.hex === "#F3E3A0"), JSON.stringify(swatch?.rows));
  expect("trend line: date range spans the series", line?.date_range?.from === "2026-08-01" && line?.date_range?.to === "2026-10-01", JSON.stringify(line?.date_range));

  // 2. The fixed widget set and its pairing rules survive a sloppy plan.
  const repaired = repairPlan({
    widgets: [
      { id: "a", chart: "trend_line", query: "attribute_growth", attribute: null, keywords: [], limit: 99 },
      { id: "a", chart: "pie", query: "top_examples" },
      { id: "c", chart: "comparison", query: "segment_compare", keywords: ["y2k"] },
      { id: "d", chart: "ranked_bar", query: "run_sql" },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, chart: "big_number", query: "item_count" })),
    ],
  });
  const [a, b] = repaired.widgets;
  expect("repair: wrong chart fixed, colors → swatches, limit capped", a.chart === "color_swatches" && a.attribute === "colors" && a.limit === 12, JSON.stringify(a));
  expect("repair: duplicate id renamed, unknown chart → default", b.id !== "a" && b.chart === "image_grid", JSON.stringify(b));
  expect("repair: one-segment compare and unknown query dropped; max 6", !repaired.widgets.some((w) => w.id === "c" || w.id === "d") && repaired.widgets.length === 6, JSON.stringify(repaired.widgets.map((w) => w.id)));

  // 3. Cache: second ask of the same question (different spacing/case) replays with cached: true.
  store.clear();
  await run("Is butter yellow still popular?", deps(goodAsk));
  const again = await run("  is BUTTER yellow still popular ", deps(deadAsk));
  expect("cache: repeat question replays the saved spec", final(again)?.cached === true && again.filter((e) => e.type === "widget").length > 0, JSON.stringify(again.map((e) => e.type)));
  expect("cache: hash ignores case, spacing, end punctuation", questionHash("b", "Hi there?") === questionHash("b", " hi  THERE "));

  // 4. Out of scope and no data → a notice with a suggestion, never an empty dashboard.
  store.clear();
  const off = final(await run("What's the weather in Boston tomorrow?", deps(goodAsk)))?.spec;
  expect("out of scope: notice + suggestion", off?.notice?.kind === "out_of_scope" && !!off.notice.suggestion && checkSpec(off).length === 0, JSON.stringify(off));
  const none = final(await run("Which colors are trending in dresses?", deps(goodAsk, { loadItems: async () => [] })))?.spec;
  expect("no data: notice + suggestion", none?.notice?.kind === "no_data" && !!none.notice.suggestion && checkSpec(none).length === 0, JSON.stringify(none));

  // 5. Timing for the non-AI match step is logged (AI steps are logged by the switchboard).
  expect("latency: match step logged", timings.includes("match"));

  // 6. A crash in data loading becomes a friendly error event, not a thrown exception.
  const crash = await run("Which colors are trending in dresses?", deps(goodAsk, { loadBrand: async () => { throw new Error("db down"); } }));
  expect("error: friendly error event", crash.length === 1 && crash[0].type === "error", JSON.stringify(crash));

  process.exit(bad ? 1 : 0);
};
main();
