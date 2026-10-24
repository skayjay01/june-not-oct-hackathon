import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ai } from "@/lib/ai";
import type { BrandProfile, DashboardEvent, DashboardSpec, Feedback, TrendItem, WeightDimension, Weights } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { DEFAULT_WEIGHTS } from "./build-digest";
import { answerQuestion as answerWith, rerankSpec, type BrandContext, type DashboardDeps } from "./dashboard-builder";
import { loadCandidates, loadItemsByIds, type TrendDb } from "./trend-store";
import { loadVocab } from "./vocab";

/**
 * Engine contract: answerQuestion(brandId, question, previous?) — streams a DashboardSpec (US-005);
 * with `previous`, a follow-up that refines that dashboard (US-009).
 */
export function answerQuestion(brandId: string, question: string, previous?: DashboardSpec): AsyncIterable<DashboardEvent> {
  return (async function* (): AsyncGenerator<DashboardEvent> {
    let deps: DashboardDeps;
    try {
      deps = await serverDeps(brandId);
    } catch (e) {
      console.error("answerQuestion setup", e);
      yield { type: "error", message: "Something went wrong building this dashboard. Please try again." };
      return;
    }
    yield* answerWith(brandId, question, deps, previous);
  })();
}

/** Engine contract: re-rank a dashboard under new weights, no AI call (US-007). */
export async function rerankDashboard(brandId: string, spec: DashboardSpec, weights: Pick<Weights, WeightDimension>): Promise<DashboardSpec> {
  const [brand, items, display] = await Promise.all([loadBrand(brandId), loadCandidates(trendDb(), brandId, spec.intent ?? null), displayDeps()]);
  return rerankSpec(spec, items, { brandId, profile: brand.profile, weights, feedback: brand.feedback }, display);
}

/** Engine contract: the real items behind a chart element (US-009); public + this brand's own rows only. */
export function getEvidence(brandId: string, itemIds: number[]): Promise<TrendItem[]> {
  return loadItemsByIds(trendDb(), brandId, itemIds);
}

/** The real dependencies: switchboard for AI, Supabase for data, saved_answers as the cache. */
async function serverDeps(brandId: string): Promise<DashboardDeps> {
  return {
    ...(await displayDeps()),
    ask: async (c) => (await ai().generateJSON({ ...c, schema: c.schema as Readonly<Record<string, unknown>> })).value,
    loadBrand,
    loadItems: (_brandId, intent) => loadCandidates(trendDb(), brandId, intent),
    cache: {
      get: async (hash) => {
        const { data } = await db().from("saved_answers").select("spec").eq("question_hash", hash).maybeSingle();
        return (data?.spec as DashboardSpec | undefined) ?? null;
      },
      set: async (hash, question, spec) => {
        await db().from("saved_answers").upsert({ brand_id: brandId, question, question_hash: hash, spec }, { onConflict: "question_hash" });
      },
    },
    logTiming: async (e) => {
      await db().from("latency_log").insert(e);
    },
  };
}

/** Profile, weights (defaults if unset) and 👍/👎 for one brand. */
async function loadBrand(brandId: string): Promise<BrandContext> {
  const [p, w, f] = await Promise.all([
    db().from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
    db().from("weights").select("*").eq("brand_id", brandId).maybeSingle(),
    db().from("feedback").select("item_key, vote").eq("brand_id", brandId),
  ]);
  for (const r of [p, w, f]) if (r.error) throw r.error;
  return {
    profile: (p.data as BrandProfile | null) ?? null,
    weights: (w.data as Weights | null) ?? DEFAULT_WEIGHTS,
    feedback: (f.data ?? []) as Pick<Feedback, "item_key" | "vote">[],
  };
}

/** What widgets need to label themselves: vocabulary, color hexes, source names. */
async function displayDeps(): Promise<Pick<DashboardDeps, "vocab" | "queryOptions" | "sourceNames">> {
  const [vocab, colorHex, sources] = await Promise.all([loadVocab(), loadColorHex(), db().from("sources").select("key, name")]);
  return {
    vocab,
    sourceNames: Object.fromEntries((sources.data ?? []).map((s) => [s.key as string, s.name as string])),
    queryOptions: { colorHex },
  };
}

/** supabase-js typed as the narrow slice trend-store uses (a structural check is too deep for tsc). */
const trendDb = () => db() as unknown as TrendDb;

let hexes: Promise<Record<string, string>> | undefined;

/** color id → hex from data/curation/colors.json, for color swatches. */
function loadColorHex(): Promise<Record<string, string>> {
  hexes ??= readFile(path.join(process.cwd(), "data", "curation", "colors.json"), "utf8")
    .then((s) => Object.fromEntries((JSON.parse(s).colors as { id: string; hex: string }[]).map((c) => [c.id, c.hex])))
    .catch(() => ({}));
  return hexes;
}
