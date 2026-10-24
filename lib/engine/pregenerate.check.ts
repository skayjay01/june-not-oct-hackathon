// Self-check for the demo pre-generator (US-006). No database or AI: both are faked.
// Run: npx tsx lib/engine/pregenerate.check.ts  (exits 1 on any problem)

import { existsSync, readFileSync } from "node:fs";
import { sampleDashboard } from "../contracts/fixtures";
import type { DashboardEvent, DashboardSpec } from "../contracts/types";
import { DEMO_BRANDS, DEMO_QUESTIONS } from "./demo-plan";
import { pregenerate, type PregenDeps } from "./pregenerate";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

// 1. The plan matches Blair's curation files (the seam: two files agreeing by hand).
const demoSet = readFileSync("data/curation/demo-set.md", "utf8");
for (const q of DEMO_QUESTIONS) expect(`plan: question is in demo-set.md — ${q.question}`, demoSet.includes(q.question));
for (const b of DEMO_BRANDS) expect(`plan: brand is in demo-set.md — ${b.name}`, demoSet.includes(b.name));
expect("plan: every question's brand is a demo brand", DEMO_QUESTIONS.every((q) => DEMO_BRANDS.some((b) => b.name === q.brand)));
const tagIds = new Set((JSON.parse(readFileSync("data/curation/style-tags.json", "utf8")).tags as { id: string }[]).map((t) => t.id));
const unknownTags = DEMO_BRANDS.flatMap((b) => b.seed.style_tags).filter((t) => !tagIds.has(t));
expect("plan: seed style tags exist in style-tags.json", unknownTags.length === 0, unknownTags.join(", "));
expect("plan: 3–5 style tags and a sane price range per brand", DEMO_BRANDS.every((b) => b.seed.style_tags.length >= 3 && b.seed.style_tags.length <= 5 && b.seed.price_min < b.seed.price_max));
if (existsSync("data/curation/presets.json")) {
  const presets = JSON.parse(readFileSync("data/curation/presets.json", "utf8")).presets as { id: string; demo_brands?: string[] }[];
  const mismatched = DEMO_BRANDS.filter((b) => !presets.find((p) => p.id === b.preset)?.demo_brands?.includes(b.name));
  expect("plan: each brand's preset matches presets.json", mismatched.length === 0, mismatched.map((b) => b.name).join(", "));
}

// 2. A run with fakes: one site can't be crawled, one digest fails, one question is off-topic.
const calls: string[] = [];
const saved = new Map<string, DashboardSpec>();
let replayDelayMs = 0;
const fakeDeps = (overrides: Partial<PregenDeps> = {}): PregenDeps => ({
  ensureBrand: async (b) => (calls.push(`brand ${b.name}`), `id-${b.name}`),
  crawl: async (id) => (calls.push(`crawl ${id}`), { saved: id === "id-Paloma Wool" ? 0 : 4 }),
  buildProfile: async (id) => void calls.push(`profile ${id}`),
  seedProfile: async (id) => void calls.push(`seed ${id}`),
  setWeights: async (id, p) => void calls.push(`weights ${id} ${p}`),
  buildDigest: async (id) => {
    if (id === "id-Prada") throw new Error("no profile yet");
    return { elements: [1, 2, 3] };
  },
  answer: (id, q) => stream(id, q),
  markDemo: async (id, q) => void calls.push(`demo ${id} ${q}`),
  ...overrides,
});
async function* stream(id: string, q: string): AsyncGenerator<DashboardEvent> {
  const key = `${id}|${q}`;
  const hit = saved.get(key);
  if (hit) {
    await new Promise((r) => setTimeout(r, replayDelayMs));
    yield { type: "done", spec: hit, cached: true };
    return;
  }
  const spec: DashboardSpec = q.includes("sports-merch")
    ? { version: 1, question: q, title: "Try a trend question", summary: "", widgets: [], notice: { kind: "out_of_scope", message: "outside", suggestion: "x" } }
    : { ...sampleDashboard, question: q };
  if (!spec.notice) saved.set(key, spec);
  yield { type: "widget", widget: sampleDashboard.widgets[0] };
  yield { type: "done", spec, cached: false };
}

const main = async () => {
  const report = await pregenerate(DEMO_BRANDS, DEMO_QUESTIONS, fakeDeps());
  const byName = (n: string) => report.brands.find((b) => b.name === n)!;
  const stepsOf = (n: string) => byName(n).steps.map((s) => `${s.step}:${s.ok ? "ok" : "x"}`).join(" ");

  expect("run: crawlable brand crawls then profiles from its site", stepsOf("Aimé Leon Dore") === "brand:ok crawl:ok profile (from site):ok weights:ok digest:ok", stepsOf("Aimé Leon Dore"));
  expect("run: empty crawl falls back to the hand-entered profile", stepsOf("Paloma Wool") === "brand:ok crawl:x profile (hand-entered):ok weights:ok digest:ok", stepsOf("Paloma Wool"));
  expect("run: reference brand is never crawled", stepsOf("Miu Miu") === "brand:ok profile (hand-entered):ok weights:ok digest:ok" && !calls.includes("crawl id-Miu Miu"), stepsOf("Miu Miu"));
  expect("run: a failed digest is reported and the run carries on", byName("Prada").steps.some((s) => s.step === "digest" && !s.ok && s.detail === "no profile yet") && report.brands.length === DEMO_BRANDS.length);
  expect("run: weights use each brand's preset", calls.includes("weights id-Damson Madder price-sensitive") && calls.includes("weights id-Prada fashion-house"));

  const q = (text: string) => report.questions.find((r) => r.question.startsWith(text))!;
  expect("questions: rehearsed answer stored, flagged demo, replayed from cache", q("Should our spring").ok && q("Should our spring").cached && calls.includes("demo id-Damson Madder Should our spring 2027 dresses lean green or orange?"), JSON.stringify(q("Should our spring")));
  expect("questions: off-topic answer is a failure, not stored as demo", !q("How big").ok && /out_of_scope/.test(q("How big").detail) && !calls.some((c) => c.startsWith("demo") && c.includes("sports-merch")), JSON.stringify(q("How big")));
  expect("report: not ok while anything failed", report.ok === false);

  // 3. Replay slower than 2 s fails US-006.
  saved.clear();
  replayDelayMs = 2100;
  const slow = await pregenerate(DEMO_BRANDS.slice(1, 2), DEMO_QUESTIONS.slice(0, 1), fakeDeps());
  expect("questions: replay over 2 s fails", !slow.questions[0].ok && slow.questions[0].cached && (slow.questions[0].replay_ms ?? 0) >= 2000 && /too slow/.test(slow.questions[0].detail), JSON.stringify(slow.questions[0]));

  // 4. A clean run reports ok; a brand that can't be created skips its questions without crashing.
  saved.clear();
  replayDelayMs = 0;
  const clean = await pregenerate(DEMO_BRANDS.filter((b) => b.name === "Massimo Dutti"), DEMO_QUESTIONS.filter((x) => x.brand === "Massimo Dutti"), fakeDeps());
  expect("report: all good → ok", clean.ok && clean.questions.length === 2, JSON.stringify(clean));
  const noBrand = await pregenerate(DEMO_BRANDS.slice(0, 1), DEMO_QUESTIONS.slice(3, 4), fakeDeps({ ensureBrand: async () => { throw new Error("db down"); } }));
  expect("run: brand creation failure skips its questions", !noBrand.ok && noBrand.questions[0].detail === "brand was not created" && noBrand.brands[0].steps.length === 1);

  process.exit(bad ? 1 : 0);
};
main();

