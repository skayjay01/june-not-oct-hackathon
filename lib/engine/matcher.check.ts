// Self-check for the matcher (A4). No database or AI needed.
// Run: npx tsx lib/engine/matcher.check.ts  (exits 1 on any problem)
//
// Covers the A4 "done when": the same question ranks visibly differently under different presets.

import { DEMO_BRAND_ID, sampleBrandProfile, sampleTrendItems, sampleWeights } from "../contracts/fixtures";
import type { QuestionIntent, TrendItem, Weights } from "../contracts/types";
import { effectiveWeights, filterItems, itemIdFromFeedbackKey, rankItems, runQuery, type MatchContext } from "./matcher";
import { loadCandidates, type TrendDb } from "./trend-store";

const NOW = new Date("2026-10-24T12:00:00Z");
const OTHER_BRAND = "00000000-0000-4000-8000-000000000002";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

// Stand-ins for Blair's presets (C5) until presets.json is merged.
type W = Pick<Weights, "price_fit" | "social_buzz" | "growth_speed" | "competitor_adoption" | "style_fit">;
const presets: Record<string, W> = {
  mass_market: { price_fit: 45, social_buzz: 20, growth_speed: 10, competitor_adoption: 20, style_fit: 5 },
  streetwear: { price_fit: 5, social_buzz: 40, growth_speed: 35, competitor_adoption: 5, style_fit: 15 },
  editorial: { price_fit: 5, social_buzz: 10, growth_speed: 25, competitor_adoption: 5, style_fit: 55 },
};

// Dresses that trade off price, buzz, growth, adoption and style differently.
const dress = (id: number, title: string, price: number, m: TrendItem["metrics"], style: string[], color: string): TrendItem => ({
  id, source: "shopify_products", source_item_id: `t-${id}`, brand_id: null, type: "product", title, category: "dresses",
  attributes: { colors: [color], style_tags: style }, price, currency: "USD", image_url: null, link: `https://store${id % 4}.example.com/p/${id}`,
  metrics: m, published_at: "2026-10-01T00:00:00Z", collected_at: "2026-10-20T00:00:00Z",
});
const items: TrendItem[] = [
  dress(101, "Cheap viral mini", 22, { growth: 0.2, search_interest: 95, store_count: 30 }, ["y2k"], "cherry-red"),
  dress(102, "Breakout cutout dress", 140, { growth: 1.4, search_interest: 70, store_count: 3 }, ["y2k"], "electric-blue"),
  dress(103, "Cashmere column dress", 310, { growth: 0.3, search_interest: 20, store_count: 2 }, ["quiet-luxury", "minimalist"], "cloud-dancer"),
  dress(104, "Everywhere slip dress", 35, { growth: 0.1, search_interest: 50, store_count: 40 }, ["office-siren"], "cherry-red"),
  dress(105, "Linen midi", 60, { growth: 0.5, search_interest: 40, store_count: 12 }, ["minimalist", "scandi"], "butter-yellow"),
  { ...dress(106, "Other brand's licensed dress", 50, { growth: 2, search_interest: 99, store_count: 50 }, ["minimalist"], "butter-yellow"), brand_id: OTHER_BRAND },
  { ...dress(107, "Our licensed dress", 55, { growth: 0.4, search_interest: 30, store_count: 5 }, ["minimalist"], "oatmeal"), brand_id: DEMO_BRAND_ID },
  { ...dress(108, "Old dress", 40, { growth: 3, search_interest: 99, store_count: 60 }, ["minimalist"], "oatmeal"), published_at: "2025-01-01T00:00:00Z", collected_at: "2025-01-02T00:00:00Z" },
  {
    id: 109, source: "google_trends", source_item_id: "kw-slip-dress", brand_id: null, type: "keyword", title: "slip dress", category: null,
    attributes: {}, price: null, currency: null, image_url: null, link: null, collected_at: "2026-10-20T00:00:00Z", published_at: null,
    metrics: { search_interest: 64, series: [{ date: "2026-09-01", value: 40 }, { date: "2026-10-01", value: 64 }] },
  },
];

const intent: QuestionIntent = {
  in_scope: true, suggestion: null, style_tags: [], categories: ["dresses"], price_min: null, price_max: null,
  focus: "product", emphasis: [], time_window_days: 90,
};
const ctxFor = (w: W, extra: Partial<MatchContext> = {}): MatchContext => ({ brandId: DEMO_BRAND_ID, profile: sampleBrandProfile, weights: w, intent, now: NOW, ...extra });
const order = (w: W, extra?: Partial<MatchContext>) => rankItems(filterItems(items, ctxFor(w, extra)), ctxFor(w, extra)).map((r) => r.item.id);

// 1. Filtering: FR-8 licensed data, time window, category, price.
const pool = filterItems(items, ctxFor(presets.mass_market)).map((i) => i.id);
expect("filter: other brand's licensed row never shown", !pool.includes(106), String(pool));
expect("filter: own licensed row kept", pool.includes(107), String(pool));
expect("filter: outside time window dropped", !pool.includes(108), String(pool));
const under50 = filterItems(items, ctxFor(presets.mass_market, { intent: { ...intent, price_max: 50 } })).filter((i) => i.type === "product").map((i) => i.id);
expect("filter: price_max 50", JSON.stringify(under50) === "[101,104]", String(under50));

// 2. Presets change the ranking (A4 done-when).
const tops = Object.fromEntries(Object.entries(presets).map(([k, w]) => [k, order(w).slice(0, 3)]));
console.log("     top 3 by preset:", JSON.stringify(tops));
expect("presets: mass market leads with a cheap, widely carried dress", [101, 104].includes(tops.mass_market[0]), JSON.stringify(tops));
expect("presets: streetwear leads with the breakout dress", tops.streetwear[0] === 102, JSON.stringify(tops));
expect("presets: editorial leads with an on-brand minimalist dress", [103, 105, 107].includes(tops.editorial[0]), JSON.stringify(tops));
expect("presets: all three top-3 lists differ", new Set(Object.values(tops).map((t) => t.join())).size === 3, JSON.stringify(tops));

// 3. Weights: emphasis nudges and still totals 100.
const ew = effectiveWeights(presets.editorial, ["growth_speed"]);
const total = Object.values(ew).reduce((s, x) => s + x, 0);
expect("weights: emphasis raises that dimension, total stays 100", Math.abs(total - 100) < 1e-9 && ew.growth_speed > presets.editorial.growth_speed, JSON.stringify(ew));

// 4. Feedback moves items.
const base = order(presets.editorial);
const down = order(presets.editorial, { feedback: [{ item_key: `linen:${base[0]}`, vote: -1 }] });
expect("feedback: 👎 on the top item lowers it", down.indexOf(base[0]) > 0, `${base} → ${down}`);
expect("feedback: key parsing", itemIdFromFeedbackKey("butter-yellow:42") === 42 && itemIdFromFeedbackKey("butter-yellow") === null && itemIdFromFeedbackKey("colors.butter-yellow:123") === 123);
const ranked = rankItems(filterItems(items, ctxFor(presets.editorial)), ctxFor(presets.editorial));
expect("rank: scores within 0–1 and sorted", ranked.every((r, i) => r.score >= 0 && r.score <= 1 && (i === 0 || ranked[i - 1].score >= r.score)));

// 5. Predefined queries.
const ctx = ctxFor(presets.editorial);
const top = runQuery("top_examples", { limit: 3 }, items, ctx);
expect("top_examples: 3 product rows linked to items", top.rows.length === 3 && top.rows.every((r) => r.item_ids?.length === 1 && r.link), JSON.stringify(top.rows));
expect("top_examples: source + date range for the footer", top.sources.join() === "shopify_products" && !!top.date_range, JSON.stringify(top));
const colors = runQuery("attribute_growth", { attribute: "colors" }, items, ctx, { colorHex: { "butter-yellow": "#F3E3A0" }, labels: { "butter-yellow": "Butter yellow" } });
expect("attribute_growth: one row per color, labelled, with hex", colors.rows.some((r) => r.label === "Butter yellow" && r.hex === "#F3E3A0") && new Set(colors.rows.map((r) => r.label)).size === colors.rows.length, JSON.stringify(colors.rows));
expect("attribute_growth: other brand's color never appears via its item", !colors.rows.some((r) => r.item_ids?.includes(106)));
const interest = runQuery("interest_over_time", { keywords: ["slip"] }, items, ctx);
expect("interest_over_time: dated series points", interest.rows.length === 2 && interest.rows.every((r) => r.date), JSON.stringify(interest.rows));
const count = runQuery("item_count", {}, items, ctx);
expect("item_count: products and stores", count.rows[0].value === 6 && count.rows[1].value === 4, JSON.stringify(count.rows));
const seg = runQuery("segment_compare", { segments: ["y2k", "minimalist"] }, items, ctx);
expect("segment_compare: two rows, growth in percent", seg.rows.length === 2 && seg.unit === "percent" && seg.rows[0].value === 80, JSON.stringify(seg.rows));

// 6. The shared fixtures work end to end.
const fixtureCtx: MatchContext = { brandId: DEMO_BRAND_ID, profile: sampleBrandProfile, weights: sampleWeights, now: NOW };
expect("fixtures: sample items rank", rankItems(filterItems(sampleTrendItems, fixtureCtx), fixtureCtx).length === sampleTrendItems.length);

// 7. loadCandidates builds the right query and normalizes rows.
const calls: string[] = [];
type Q = ReturnType<TrendDb["from"]>;
const result = Promise.resolve({ data: [{ ...items[0], price: "22.00", metrics: null }] as unknown[], error: null });
const fakeQuery: Q = {
  select: (c) => (calls.push(`select ${c}`), fakeQuery),
  or: (f) => (calls.push(`or ${f}`), fakeQuery),
  gte: (c, v) => (calls.push(`gte ${c} ${v.slice(0, 10)}`), fakeQuery),
  order: () => fakeQuery,
  limit: () => fakeQuery,
  then: (ok, fail) => result.then(ok, fail),
};
const db: TrendDb = { from: () => fakeQuery };
const main = async () => {
  const rows = await loadCandidates(db, DEMO_BRAND_ID, { time_window_days: 30 }, NOW);
  expect("loadCandidates: public + own brand only", calls.includes(`or brand_id.is.null,brand_id.eq.${DEMO_BRAND_ID}`), calls.join(" | "));
  expect("loadCandidates: time window", calls.includes("gte collected_at 2026-09-24"), calls.join(" | "));
  expect("loadCandidates: numeric price, empty metrics", rows[0].price === 22 && JSON.stringify(rows[0].metrics) === "{}");
  const rejected = await loadCandidates(db, "x),brand_id.not.is.null", null, NOW).then(() => false, () => true);
  expect("loadCandidates: refuses a non-uuid brand id", rejected);
  process.exit(bad ? 1 : 0);
};
main();
