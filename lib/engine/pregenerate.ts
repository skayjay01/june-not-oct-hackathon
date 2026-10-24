// US-006 — builds the demo ahead of time so the live pitch never waits on the AI:
// demo brands → profile (crawled, or the hand-entered seed) → weights preset → digest,
// then every rehearsed question → stored dashboard, then re-asks each one to prove it
// comes back from the cache in under 2 seconds. One step failing never stops the rest.

import type { DashboardEvent, DashboardSpec } from "../contracts/types";
import { checkDashboard } from "../contracts/validate";
import type { DemoBrand, DemoQuestion } from "./demo-plan";

/** US-006: rehearsed questions load in under 2 seconds. */
export const REHEARSED_LIMIT_MS = 2000;

/** The real work, injected so the run order and reporting can be tested without a database or AI. */
export interface PregenDeps {
  /** find the brand by website, or create it; returns its id */
  ensureBrand(b: DemoBrand): Promise<string>;
  crawl(brandId: string): Promise<{ saved: number }>;
  buildProfile(brandId: string): Promise<unknown>;
  /** writes the hand-entered profile (reference brands, or when a crawl finds nothing) */
  seedProfile(brandId: string, b: DemoBrand): Promise<void>;
  setWeights(brandId: string, preset: DemoBrand["preset"]): Promise<void>;
  buildDigest(brandId: string): Promise<{ elements: unknown[] }>;
  answer(brandId: string, question: string): AsyncIterable<DashboardEvent>;
  /** flags the stored answer as demo content (saved_answers.is_demo) */
  markDemo(brandId: string, question: string): Promise<void>;
  /** set to rebuild: drops the stored answer first so the question is answered afresh */
  forget?(brandId: string, question: string): Promise<void>;
  log?: (line: string) => void;
}

export interface StepResult {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface PregenReport {
  brands: { name: string; id: string | null; steps: StepResult[] }[];
  questions: { question: string; brand: string; ok: boolean; detail: string; build_ms: number; replay_ms: number | null; cached: boolean }[];
  ok: boolean;
}

export async function pregenerate(brands: DemoBrand[], questions: DemoQuestion[], deps: PregenDeps): Promise<PregenReport> {
  const log = deps.log ?? (() => {});
  const report: PregenReport = { brands: [], questions: [], ok: true };
  const ids = new Map<string, string>();

  for (const b of brands) {
    const steps: StepResult[] = [];
    const step = async (name: string, fn: () => Promise<string>) => {
      const t0 = Date.now();
      try {
        const detail = await fn();
        steps.push({ step: name, ok: true, ms: Date.now() - t0, detail });
        return true;
      } catch (e) {
        steps.push({ step: name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        const s = steps[steps.length - 1];
        log(`${b.name} · ${s.step}: ${s.ok ? "ok" : "FAILED"} (${s.ms} ms) ${s.detail}`);
      }
    };

    let id: string | null = null;
    await step("brand", async () => ((id = await deps.ensureBrand(b)), id));
    if (id === null) {
      report.brands.push({ name: b.name, id, steps });
      continue;
    }
    const brandId: string = id;
    ids.set(b.name, brandId);

    // crawlable brands: own site text → AI profile; if that yields nothing, fall back to the seed
    let profiled = false;
    if (b.crawlable) {
      const crawled = await step("crawl", async () => {
        const { saved } = await deps.crawl(brandId);
        if (!saved) throw new Error("no pages saved");
        return `${saved} pages`;
      });
      if (crawled) profiled = await step("profile (from site)", async () => (await deps.buildProfile(brandId), "built"));
    }
    if (!profiled) await step("profile (hand-entered)", async () => (await deps.seedProfile(brandId, b), b.seed.style_tags.join(", ")));
    await step("weights", async () => (await deps.setWeights(brandId, b.preset), b.preset));
    await step("digest", async () => `${(await deps.buildDigest(brandId)).elements.length} trends`);
    report.brands.push({ name: b.name, id: brandId, steps });
  }

  for (const q of questions) {
    const brandId = ids.get(q.brand);
    const row = { question: q.question, brand: q.brand, ok: false, detail: "", build_ms: 0, replay_ms: null as number | null, cached: false };
    report.questions.push(row);
    if (!brandId) {
      row.detail = "brand was not created";
      continue;
    }
    try {
      await deps.forget?.(brandId, q.question);
      const t0 = Date.now();
      const built = await finalSpec(deps.answer(brandId, q.question));
      row.build_ms = Date.now() - t0;
      const problems = built.spec ? checkDashboard(built.spec) : [built.error ?? "no dashboard"];
      if (built.spec?.notice) problems.push(`${built.spec.notice.kind}: ${built.spec.notice.message}`);
      if (problems.length) {
        row.detail = problems.join("; ");
        continue;
      }
      await deps.markDemo(brandId, q.question);

      // replay as the presenter would: same question, must come from the stored answer
      const t1 = Date.now();
      const replay = await finalSpec(deps.answer(brandId, q.question));
      row.replay_ms = Date.now() - t1;
      row.cached = replay.cached;
      row.ok = replay.cached && row.replay_ms < REHEARSED_LIMIT_MS;
      row.detail = `${built.spec!.widgets.length} widgets` + (row.ok ? "" : replay.cached ? `; replay too slow` : "; replay was not served from the cache");
    } catch (e) {
      row.detail = e instanceof Error ? e.message : String(e);
    } finally {
      log(`Q "${q.question}" (${q.brand}): ${row.ok ? "ok" : "FAILED"} build ${row.build_ms} ms, replay ${row.replay_ms ?? "-"} ms. ${row.detail}`);
    }
  }

  report.ok = report.brands.every((b) => b.steps.every((s) => s.ok || s.step === "crawl" || s.step === "profile (from site)")) && report.questions.every((q) => q.ok);
  return report;
}

async function finalSpec(events: AsyncIterable<DashboardEvent>): Promise<{ spec: DashboardSpec | null; cached: boolean; error?: string }> {
  for await (const e of events) {
    if (e.type === "done") return { spec: e.spec, cached: e.cached };
    if (e.type === "error") return { spec: null, cached: false, error: e.message };
  }
  return { spec: null, cached: false, error: "stream ended without a dashboard" };
}
