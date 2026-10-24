// A5 — Dashboard builder: question → streamed DashboardSpec (US-005, FR-11 to FR-14).
// interpret (A3) → match (A4 candidates) → assemble (AI picks widgets from the fixed set)
// → run the predefined queries → design (AI writes the summary from the rows only).
// Every AI step has a plain fallback, so a failed AI call degrades the answer, never errors it.

import { createHash, randomUUID } from "node:crypto";
import { checkDashboard } from "../contracts/validate";
import { dashboardPlanSchema, dashboardSummarySchema } from "../contracts/schemas";
import type {
  BrandProfile, ChartType, DashboardEvent, DashboardSpec, Feedback, QueryName, QueryParams, QuestionIntent, TrendItem, WeightDimension, Weights, Widget,
} from "../contracts/types";
import { runQuery, type MatchContext, type QueryOptions } from "./matcher";
import { readQuestion, type QuestionVocab } from "./question-reader";

export const MAX_WIDGETS = 6;

/** One structured AI call; the A1 switchboard's generateJSON(...).value fits. */
export type AskStep = <T>(call: AskCall<T>) => Promise<T>;
export interface AskCall<T> {
  step: "interpret" | "assemble" | "design";
  schema: object;
  schemaName: string;
  system: string;
  prompt: string;
  requestId?: string;
  validate?: (value: T) => string[];
}

export interface BrandContext {
  profile: BrandProfile | null;
  weights: Pick<Weights, WeightDimension>;
  feedback?: Pick<Feedback, "item_key" | "vote">[];
}

export interface DashboardDeps {
  ask: AskStep;
  vocab: QuestionVocab;
  loadBrand: (brandId: string) => Promise<BrandContext>;
  /** candidate pool for the matcher, e.g. trend-store loadCandidates */
  loadItems: (brandId: string, intent: QuestionIntent) => Promise<TrendItem[]>;
  /** saved_answers by question hash (FR-19); omit to disable caching */
  cache?: { get(hash: string): Promise<DashboardSpec | null>; set(hash: string, question: string, spec: DashboardSpec): Promise<void> };
  /** non-AI step timings (FR-20); AI steps are logged by the switchboard */
  logTiming?: (entry: { request_id: string; step: "match"; ms: number; model: null }) => void | Promise<void>;
  /** source key → display name for widget footers */
  sourceNames?: Record<string, string>;
  queryOptions?: QueryOptions;
  now?: () => Date;
}

/** saved_answers.question_hash: brand + question, ignoring case, spacing and end punctuation. */
export function questionHash(brandId: string, question: string): string {
  const norm = question.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!\s]+$/, "");
  return createHash("sha256").update(`${brandId}\n${norm}`).digest("hex");
}

/**
 * Streams a dashboard for `question`. With `previous` (US-009), the question is a follow-up
 * that refines that dashboard: it keeps the earlier settings unless the follow-up changes them.
 */
export async function* answerQuestion(brandId: string, question: string, deps: DashboardDeps, previous?: DashboardSpec | null): AsyncGenerator<DashboardEvent> {
  const requestId = randomUUID();
  const now = deps.now?.() ?? new Date();
  const earlier = previous?.intent?.in_scope ? { question: previous.question, intent: previous.intent } : null;
  const hash = questionHash(brandId, earlier ? `${earlier.question}\n→ ${question}` : question);

  try {
    const hit = await deps.cache?.get(hash).catch(() => null);
    if (hit) {
      yield* replay(hit);
      return;
    }

    const brand = await deps.loadBrand(brandId);
    const { intent } = await readQuestion(question, {
      vocab: deps.vocab,
      profile: brand.profile,
      previous: earlier,
      ask: (c) => deps.ask({ ...c, step: "interpret", requestId }),
    });
    const extra = { intent, ...(earlier ? { follows: earlier.question } : {}) };

    if (!intent.in_scope) {
      const spec = { ...noticeSpec(question, "out_of_scope", "That question is outside what the trend dashboard covers.", intent.suggestion), ...extra };
      yield { type: "done", spec, cached: false };
      return;
    }

    const t0 = Date.now();
    const items = await deps.loadItems(brandId, intent);
    const ctx: MatchContext = { brandId, profile: brand.profile, weights: brand.weights, intent, feedback: brand.feedback, now };
    await deps.logTiming?.({ request_id: requestId, step: "match", ms: Date.now() - t0, model: null });

    const plan = await planWidgets(earlier ? `${earlier.question} (follow-up: ${question})` : question, intent, items, deps, requestId);
    yield { type: "plan", title: plan.title, widget_ids: plan.widgets.map((w) => w.id) };

    const widgets: Widget[] = [];
    for (const w of plan.widgets) {
      const filled = fillWidget(w, items, ctx, deps);
      if (!filled) continue; // no data for this widget: leave it out rather than show an empty chart
      widgets.push(filled);
      yield { type: "widget", widget: filled };
    }

    if (!widgets.length) {
      const spec = { ...noticeSpec(question, "no_data", "We don't have enough trend data for that yet.", broaderSuggestion(intent, deps.vocab)), ...extra };
      yield { type: "done", spec, cached: false };
      return;
    }

    const summary = await writeSummary(question, widgets, deps, requestId);
    yield { type: "summary", summary };

    const spec: DashboardSpec = { version: 1, question, title: plan.title, summary, widgets, ...extra };
    await deps.cache?.set(hash, question, spec).catch(() => undefined);
    yield { type: "done", spec, cached: false };
  } catch (e) {
    yield { type: "error", message: "Something went wrong building this dashboard. Please try again." };
    console.error("answerQuestion", requestId, e);
  }
}

async function* replay(spec: DashboardSpec): AsyncGenerator<DashboardEvent> {
  yield { type: "plan", title: spec.title, widget_ids: spec.widgets.map((w) => w.id) };
  for (const widget of spec.widgets) yield { type: "widget", widget };
  if (spec.summary) yield { type: "summary", summary: spec.summary };
  yield { type: "done", spec, cached: true };
}

function noticeSpec(question: string, kind: "out_of_scope" | "no_data", message: string, suggestion: string | null): DashboardSpec {
  return { version: 1, question, title: kind === "out_of_scope" ? "Try a trend question" : "Not enough data yet", summary: "", widgets: [], notice: { kind, message, suggestion } };
}

function broaderSuggestion(intent: QuestionIntent, vocab: QuestionVocab): string {
  const cat = vocab.categories.find((c) => c.id === intent.categories[0])?.label.toLowerCase();
  return cat ? `Which colors are gaining traction in ${cat} over the past 6 months?` : "Which colors are gaining traction in dresses over the past 6 months?";
}

// ---------- assemble: which widgets ----------

interface PlannedWidget {
  id: string;
  chart: ChartType;
  query: QueryName;
  title: string;
  caption: string;
  attribute: QueryParams["attribute"] | null;
  keywords: string[];
  limit: number;
}
interface Plan {
  title: string;
  widgets: PlannedWidget[];
}

/** Which queries each chart can draw, first = default. */
const CHART_QUERIES: Record<ChartType, QueryName[]> = {
  trend_line: ["interest_over_time"],
  ranked_bar: ["attribute_growth", "top_examples", "segment_compare", "editorial_signals"],
  image_grid: ["top_examples"],
  big_number: ["item_count"],
  comparison: ["segment_compare"],
  color_swatches: ["attribute_growth"],
};
const DEFAULT_CHART: Record<QueryName, ChartType> = {
  attribute_growth: "ranked_bar",
  interest_over_time: "trend_line",
  top_examples: "image_grid",
  item_count: "big_number",
  segment_compare: "comparison",
  editorial_signals: "ranked_bar",
};
const ATTRIBUTES = ["colors", "silhouette", "material", "pattern", "style_tags"] as const;

const PLAN_SYSTEM = `You design a small trend dashboard answering one question for a fashion brand. Pick 3 to ${MAX_WIDGETS} widgets from this fixed set; each widget pairs a chart with a predefined query.

Queries:
- attribute_growth: ranks values of one attribute (colors, silhouette, material, pattern or style_tags) by trend strength. Set attribute.
- top_examples: the best-matching real products, with images.
- interest_over_time: search interest over time for keywords. Put 1–3 short search phrases in keywords.
- item_count: how many matching products and stores carry them.
- segment_compare: compares two segments. Put exactly two ids (categories, style tags, colors, silhouettes, materials or patterns) in keywords.
- editorial_signals: runway, Lyst and press facts behind the trend, weighted by which houses show it, each linked to its source. Set attribute to narrow it (colors, material or pattern); optional keywords filter by words in the fact. Include it whenever runway/press signals are listed, and always for upcoming-season questions.

Charts and the queries they can show:
- color_swatches: attribute_growth with attribute colors (use for color questions)
- ranked_bar: attribute_growth, top_examples, segment_compare or editorial_signals
- image_grid: top_examples (almost always include one, so answers show real products)
- big_number: item_count
- trend_line: interest_over_time
- comparison: segment_compare

Use only the data described in the prompt; skip queries whose data is missing. Set keywords to [] and attribute to null when not used. limit is how many rows to show (3–12). Titles are short; each caption is one plain sentence saying what the widget shows. Give each widget a short unique id like "w1".`;

async function planWidgets(question: string, intent: QuestionIntent, items: TrendItem[], deps: DashboardDeps, requestId: string): Promise<Plan> {
  const prompt = `Question: ${question}

How it was read: ${JSON.stringify({ focus: intent.focus, categories: intent.categories, style_tags: intent.style_tags, price_min: intent.price_min, price_max: intent.price_max, time_window_days: intent.time_window_days })}

Data available: ${describeData(items)}`;
  try {
    const raw = await deps.ask<Plan>({
      step: "assemble", schema: dashboardPlanSchema, schemaName: "dashboard_plan", system: PLAN_SYSTEM, prompt, requestId,
      validate: (p) => (repairPlan(p).widgets.length ? [] : ["plan has no usable widgets"]),
    });
    const plan = repairPlan(raw);
    if (plan.widgets.length) return plan;
  } catch {
    // fall through to the default plan
  }
  return defaultPlan(question, intent, items.some((i) => i.evidence));
}

/** Short census of the candidate pool so the AI doesn't plan widgets with no data. */
function describeData(items: TrendItem[]): string {
  const products = items.filter((i) => i.type === "product");
  const keywords = items.filter((i) => i.type === "keyword" && !i.evidence);
  const signals = items.filter((i) => i.evidence);
  const top = (vals: (string | undefined)[]) => {
    const n = new Map<string, number>();
    for (const v of vals) if (v) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v]) => v).join(", ") || "none";
  };
  return [
    `${products.length} products, ${keywords.length} search keywords.`,
    `${signals.length} runway/press signals${signals.length ? `, e.g. ${signals.slice(0, 8).map((i) => i.title).join("; ")}` : ""}.`,
    `Colors: ${top(items.flatMap((i) => i.attributes.colors ?? []))}.`,
    `Silhouettes: ${top(items.map((i) => i.attributes.silhouette))}.`,
    `Materials: ${top(items.map((i) => i.attributes.material))}.`,
    `Patterns: ${top(items.map((i) => i.attributes.pattern))}.`,
    `Style tags: ${top(items.flatMap((i) => i.attributes.style_tags ?? []))}.`,
    `Keywords: ${keywords.slice(0, 10).map((k) => k.title).join(", ") || "none"}.`,
  ].join("\n");
}

/** Makes any AI plan usable: valid chart/query pairs, unique ids, sane limits, at most 6 widgets. */
export function repairPlan(raw: unknown): Plan {
  const r = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; widgets?: unknown };
  const ids = new Set<string>();
  const widgets: PlannedWidget[] = [];
  for (const w of Array.isArray(r.widgets) ? r.widgets : []) {
    if (!w || typeof w !== "object") continue;
    const x = w as Record<string, unknown>;
    const query = x.query as QueryName;
    if (!(query in DEFAULT_CHART)) continue;
    let chart = (x.chart as ChartType) in CHART_QUERIES && CHART_QUERIES[x.chart as ChartType].includes(query) ? (x.chart as ChartType) : DEFAULT_CHART[query];
    let attribute = (ATTRIBUTES as readonly unknown[]).includes(x.attribute) ? (x.attribute as PlannedWidget["attribute"]) : null;
    if (chart === "color_swatches") attribute = "colors";
    if (query === "attribute_growth" && !attribute) attribute = "colors";
    if (query === "attribute_growth" && attribute === "colors" && chart === "ranked_bar") chart = "color_swatches";
    const keywords = Array.isArray(x.keywords) ? x.keywords.filter((k): k is string => typeof k === "string" && !!k.trim()).slice(0, 5) : [];
    if (query === "segment_compare" && keywords.length < 2) continue;
    let id = typeof x.id === "string" && x.id.trim() ? x.id.trim() : `w${widgets.length + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);
    const limit = typeof x.limit === "number" && Number.isFinite(x.limit) ? Math.min(12, Math.max(3, Math.round(x.limit))) : 8;
    widgets.push({
      id, chart, query, attribute, keywords, limit,
      title: typeof x.title === "string" && x.title.trim() ? x.title.trim() : defaultTitle(query, attribute),
      caption: typeof x.caption === "string" ? x.caption.trim() : "",
    });
    if (widgets.length === MAX_WIDGETS) break;
  }
  return { title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Trend dashboard", widgets };
}

const FOCUS_ATTR: Partial<Record<QuestionIntent["focus"], PlannedWidget["attribute"]>> = { color: "colors", silhouette: "silhouette", material: "material", pattern: "pattern" };

/** Used when the AI can't plan: a sensible layout for the question's focus. */
export function defaultPlan(question: string, intent: QuestionIntent, hasSignals = false): Plan {
  const attr = FOCUS_ATTR[intent.focus] ?? "colors";
  const w = (id: string, chart: ChartType, query: QueryName, attribute: PlannedWidget["attribute"], caption: string, limit = 8): PlannedWidget =>
    ({ id, chart, query, attribute, keywords: [], limit, title: defaultTitle(query, attribute), caption });
  return {
    title: question.length > 60 ? `${question.slice(0, 57)}…` : question.replace(/\?$/, ""),
    widgets: [
      w("w1", attr === "colors" ? "color_swatches" : "ranked_bar", "attribute_growth", attr, `The ${attr === "colors" ? "colors" : attr} with the strongest trend signals for this question.`),
      w("w2", "image_grid", "top_examples", null, "Real products that best match the question and your brand.", 6),
      w("w3", "big_number", "item_count", null, "How many matching products we found, and in how many stores."),
      ...(hasSignals ? [w("w4", "ranked_bar", "editorial_signals", FOCUS_ATTR[intent.focus] ?? null, "Runway and press signals behind this trend, weighted by which houses show it.")] : []),
    ],
  };
}

function defaultTitle(query: QueryName, attribute: PlannedWidget["attribute"]): string {
  switch (query) {
    case "attribute_growth": return `Rising ${attribute === "style_tags" ? "styles" : attribute === "colors" ? "colors" : `${attribute}s`}`;
    case "top_examples": return "Top examples";
    case "interest_over_time": return "Search interest";
    case "item_count": return "Matching products";
    case "segment_compare": return "Side by side";
    case "editorial_signals": return "Runway & press signals";
  }
}

// ---------- fill: run each widget's query ----------

function fillWidget(w: PlannedWidget, items: TrendItem[], ctx: MatchContext, deps: DashboardDeps): Widget | null {
  const intent = ctx.intent!;
  const params: QueryParams = {
    categories: intent.categories.length ? intent.categories : undefined,
    style_tags: w.query === "top_examples" || w.query === "item_count" ? undefined : intent.style_tags.length ? intent.style_tags : undefined,
    price_min: intent.price_min ?? undefined,
    price_max: intent.price_max ?? undefined,
    time_window_days: intent.time_window_days,
    limit: w.limit,
    ...(w.attribute ? { attribute: w.attribute } : {}),
    ...(w.query === "segment_compare" ? { segments: [w.keywords[0], w.keywords[1]] as [string, string] } : {}),
    ...((w.query === "interest_over_time" || w.query === "editorial_signals") && w.keywords.length ? { keywords: w.keywords } : {}),
  };
  return runWidget({ id: w.id, chart: w.chart, query: w.query, params, title: w.title, caption: w.caption || defaultTitle(w.query, w.attribute) }, items, ctx, deps);
}

/** Runs a widget's predefined query and attaches rows, source and date range; null when it has no data. */
function runWidget(w: Omit<Widget, "rows" | "source" | "date_range" | "unit">, items: TrendItem[], ctx: MatchContext, deps: Pick<DashboardDeps, "vocab" | "queryOptions" | "sourceNames">): Widget | null {
  const res = runQuery(w.query, w.params, items, ctx, { ...deps.queryOptions, labels: { ...vocabLabels(deps.vocab), ...deps.queryOptions?.labels } });
  const empty = !res.rows.length || (w.query === "item_count" && res.rows[0].value === 0) || (w.query === "segment_compare" && res.rows.every((r) => !r.item_ids?.length));
  if (empty) return null;
  return {
    id: w.id, chart: w.chart, query: w.query, params: w.params, title: w.title, caption: w.caption,
    source: res.sources.map((s) => deps.sourceNames?.[s] ?? s).join(", "),
    date_range: res.date_range ?? undefined,
    rows: res.rows,
    unit: res.unit,
  };
}

// ---------- re-rank under new weights (US-007) ----------

/**
 * Re-runs every widget's saved query under `ctx` (typically new weights). No AI call: widgets,
 * titles and captions stay; rows are recomputed. If any widget's top row changed, the AI summary
 * may now be wrong, so it is replaced with a plain one from the new rows.
 */
export function rerankSpec(spec: DashboardSpec, items: TrendItem[], ctx: Omit<MatchContext, "intent">, deps: Pick<DashboardDeps, "vocab" | "queryOptions" | "sourceNames">): DashboardSpec {
  if (!spec.widgets.length) return spec;
  const full: MatchContext = { ...ctx, intent: spec.intent ?? null };
  const widgets = spec.widgets.map((w) => runWidget(w, items, full, deps)).filter((w): w is Widget => !!w);
  if (!widgets.length) return spec; // the data moved under us; keep what the user was looking at
  const topChanged = widgets.some((w) => w.rows?.[0]?.label !== spec.widgets.find((o) => o.id === w.id)?.rows?.[0]?.label);
  return { ...spec, widgets, summary: topChanged ? plainSummary(widgets) : spec.summary };
}

/** id → label for every vocabulary list, so widgets show "Butter yellow", not "butter-yellow". */
function vocabLabels(v: QuestionVocab): Record<string, string> {
  return Object.fromEntries([...v.categories, ...v.styleTags, ...v.colors].map((e) => [e.id, e.label]));
}

// ---------- design: the summary ----------

const SUMMARY_SYSTEM = `You write the 2–3 sentence summary at the top of a fashion trend dashboard for a small brand's founder. Use only the numbers and names in the widgets given; never invent data, brands, stores or percentages. Index values are relative trend scores within this dashboard (0–100), not growth or sales, so compare them but never call a low one "plateaued" or "weak" on its own. Products and stores are other stores' listings in the trend library, shown as evidence: they are not the founder's stock, stores or partners, so never tell the founder to buy, promote or stock a specific listed product. Scores from different widgets are not comparable. When runway or press signals are shown, name the most relevant one and the houses or source behind it. Plain words, no jargon, no hype. Lead with the clearest finding, then one practical takeaway.`;

async function writeSummary(question: string, widgets: Widget[], deps: DashboardDeps, requestId: string): Promise<string> {
  const data = widgets.map((w) => ({ title: w.title, unit: w.unit, rows: (w.rows ?? []).slice(0, 5).map((r) => [r.label, r.value]) }));
  try {
    const { summary } = await deps.ask<{ summary: string }>({
      step: "design", schema: dashboardSummarySchema, schemaName: "dashboard_summary", system: SUMMARY_SYSTEM, requestId,
      prompt: `Question: ${question}\n\nWidgets (unit: index = trend score 0–100, percent = growth, count = items):\n${JSON.stringify(data)}`,
      validate: (v) => (typeof v?.summary === "string" && v.summary.trim().length >= 20 && v.summary.length <= 600 ? [] : ["summary must be 20–600 characters"]),
    });
    return summary.trim();
  } catch {
    return plainSummary(widgets);
  }
}

/** Fallback summary built from the first widget's top rows. */
function plainSummary(widgets: Widget[]): string {
  const ranked = widgets.find((w) => w.query === "attribute_growth") ?? widgets[0];
  const top = (ranked.rows ?? []).slice(0, 3).map((r) => r.label);
  const count = widgets.find((w) => w.query === "item_count")?.rows?.[0]?.value;
  const lead = top.length ? `Leading in "${ranked.title}": ${top.join(", ")}.` : `${ranked.title} is shown below.`;
  return count ? `${lead} Based on ${count} matching products.` : lead;
}

/** For tests and the demo pre-generator: the spec checks the contract enforces. */
export const checkSpec = (spec: DashboardSpec) => checkDashboard(spec);
