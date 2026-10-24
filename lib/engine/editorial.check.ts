// Self-check for Blair's editorial signals + house weighting + trickle-down (data/curation).
// Run: npx tsx lib/engine/editorial.check.ts  (exits 1 on any problem)

import { readFileSync } from "node:fs";
import { DEMO_BRAND_ID, sampleBrandProfile } from "../contracts/fixtures";
import type { DashboardEvent, TrendItem } from "../contracts/types";
import { answerQuestion, type AskStep } from "./dashboard-builder";
import { buildEditorialItems, parseCsv, readCurationFiles } from "./editorial";
import { filterItems, rankItems, runQuery, type MatchContext } from "./matcher";
import { loadQuestionVocab } from "./question-reader";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

const files = readCurationFiles()!;
const items = buildEditorialItems(files);
const byId = (sid: string) => items.find((i) => i.source_item_id === sid)!;
const csvRows = parseCsv(files.signalsCsv);

// 1. Loading
expect("csv: quoted commas and newlines parse into whole rows", csvRows.length > 100 && csvRows.every((r) => r.signal_id && r.reliability && (r.source_url?.startsWith("http") || r.reliability === "blair_observation")), `${csvRows.length} rows`);
expect("items: one per signal, negative ids, public, linked to the source", items.length === csvRows.length && items.every((i) => i.id < 0 && i.brand_id === null && i.evidence && (i.link || i.evidence.reliability === "blair_observation")), `${items.length}`);
expect("items: unique ids", new Set(items.map((i) => i.id)).size === items.length);
const colorIds = new Set((JSON.parse(files.colorsJson).colors as { id: string }[]).map((c) => c.id));
const usedColors = items.flatMap((i) => i.attributes.colors ?? []);
expect("colors: only ids from colors.json", usedColors.length > 0 && usedColors.every((c) => colorIds.has(c)), usedColors.filter((c) => !colorIds.has(c)).join(","));
expect("colors: exact code maps to one color (buttercream → YE-05)", byId("buttercream-fw26").attributes.colors?.length === 1, JSON.stringify(byId("buttercream-fw26").attributes));
expect("colors: family code maps to that family's shades (green → GR)", (byId("green-ss27").attributes.colors?.length ?? 0) > 1, JSON.stringify(byId("green-ss27").attributes));
expect("types: color/material/pattern map to color/fabric/pattern", byId("green-ss27").type === "color" && items.some((i) => i.type === "fabric") && items.some((i) => i.type === "pattern"));
expect("metrics: +% year on year becomes growth (tartan +40%)", byId("tartan-fw26").metrics.growth === 0.4, JSON.stringify(byId("tartan-fw26").metrics));

// 2. House weighting (brand-weights.json)
const bw = JSON.parse(files.brandWeightsJson!);
const bows = bw.cross_check.results.find((r: { trend: string }) => r.trend.startsWith("Bows"));
expect("weights: cross-check result weight lands on its signals (bows 2.5)", byId(bows.prada).metrics.house_weight === bows.weight && byId(bows.chanel).metrics.house_weight === bows.weight, JSON.stringify(byId(bows.prada).metrics));
const neutral = items.filter((i) => i.metrics.house_weight === 1).length;
expect("weights: signals no lead house shows stay neutral at 1.0", neutral > 0 && items.every((i) => (i.metrics.house_weight ?? 0) >= 1 && (i.metrics.house_weight ?? 0) <= 3));

// 3. Trickle-down
const trickle = parseCsv(files.trickleCsv!);
const massIds = trickle.filter((r) => /reached mass/.test(r.stage)).flatMap((r) => r.evidence_signal_ids.split(";")).filter((id) => items.some((i) => i.source_item_id === id));
expect("trickle-down: 'reached mass' evidence has adoption 1", massIds.length > 0 && massIds.every((id) => byId(id).metrics.adoption === 1), massIds.join(","));

// 4. Ranking: house weight multiplies the score (control: same item at weight 1 vs 2.5)
const ctx: MatchContext = { brandId: DEMO_BRAND_ID, profile: sampleBrandProfile, weights: { price_fit: 20, social_buzz: 20, growth_speed: 20, competitor_adoption: 20, style_fit: 20 }, now: new Date("2026-10-25T00:00:00Z") };
const twin = (w: number, id: number): TrendItem => ({ ...byId("tartan-fw26"), id, metrics: { ...byId("tartan-fw26").metrics, house_weight: w } });
const pair = rankItems([twin(1, -9001), twin(2.5, -9002)], ctx);
expect("ranking: identical signals, the 2.5× house one ranks first at 2.5× the score", pair[0].item.id === -9002 && Math.abs(pair[0].score / pair[1].score - 2.5) < 1e-9, JSON.stringify(pair.map((p) => [p.item.id, p.score])));

// 5. The new query and a demo question answered from editorial evidence alone (empty trend library)
const sig = runQuery("editorial_signals", { attribute: "colors", limit: 5 }, items, ctx);
expect("editorial_signals: color facts, linked, with sources", sig.rows.length === 5 && sig.rows.every((r) => r.link && (r.item_ids?.[0] ?? 0) < 0) && sig.sources.join() === "editorial", JSON.stringify(sig.rows.slice(0, 2)));
const vocab = loadQuestionVocab();
const deadAsk: AskStep = async () => {
  throw new Error("AI down");
};
const run = async (q: string) => {
  const ev: DashboardEvent[] = [];
  for await (const e of answerQuestion(DEMO_BRAND_ID, q, { ask: deadAsk, vocab, loadBrand: async () => ({ profile: sampleBrandProfile, weights: ctx.weights }), loadItems: async () => filterItems(items, ctx), now: () => ctx.now! })) ev.push(e);
  return ev.find((e): e is Extract<DashboardEvent, { type: "done" }> => e.type === "done")?.spec;
};

const main = async () => {
  const green = await run("Should our spring 2027 dresses lean green or orange?");
  const swatch = green?.widgets.find((w) => w.chart === "color_swatches");
  const ed = green?.widgets.find((w) => w.query === "editorial_signals");
  expect("demo Q1 with no store data: answered, not 'no data'", !!green && !green.notice && !!swatch && !!ed, JSON.stringify({ notice: green?.notice, widgets: green?.widgets.map((w) => w.query) }));
  const greens = new Set(byId("green-ss27").attributes.colors);
  const families = (JSON.parse(files.colorsJson).colors as { id: string; name: string; family: string }[]);
  const fam = (label: string) => families.find((c) => c.name === label)?.family;
  const shown = swatch?.rows?.map((r) => fam(r.label)) ?? [];
  expect("demo Q1: swatches show only green and orange shades, both present", shown.length > 0 && shown.every((f) => f === "green" || f === "orange") && shown.includes("green") && shown.includes("orange"), JSON.stringify(swatch?.rows?.map((r) => r.label)));
  expect("demo Q1: the reader caught both color families", !!green?.intent?.colors?.some((c) => greens.has(c)), JSON.stringify(green?.intent?.colors));
  const prints = await run("Which prints should we add for fall?");
  expect("demo Q3: print signals answer it", !!prints && !prints.notice && !!prints.widgets.find((w) => w.query === "editorial_signals"), JSON.stringify(prints?.notice));
  console.log(`     loaded ${items.length} signals; demo-set.md mentions ${(readFileSync("data/curation/demo-set.md", "utf8").match(/`[a-z0-9-]+`/g) ?? []).length} signal ids`);
  process.exit(bad ? 1 : 0);
};
main();
