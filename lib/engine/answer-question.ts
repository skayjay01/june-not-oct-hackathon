import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ai } from "@/lib/ai";
import type { BrandProfile, DashboardEvent, DashboardSpec, Feedback, TrendItem, WeightDimension, Weights } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { DEFAULT_WEIGHTS } from "./build-digest";
import { editorialItems } from "./editorial";
import { answerQuestion as answerWith, rerankSpec, type BrandContext, type DashboardDeps } from "./dashboard-builder";
import { loadCandidates, loadItemsByIds, type TrendDb } from "./trend-store";
import { loadVocab } from "./vocab";

/**
 * The secret-key client seen through trend-store's narrow query interface (select → or/in/gte/order/limit).
 * Cast because supabase-js's generic builder types are too deep for TypeScript to compare structurally.
 */
const trendDb = () => db() as unknown as TrendDb;

const FRIENDLY_ERROR = "Something went wrong building this dashboard. Please try again.";

/** Engine contract: answerQuestion — streams a DashboardSpec (US-005); with `previous`, a follow-up (US-009). */
export function answerQuestion(brandId: string, question: string, previous?: DashboardSpec): AsyncIterable<DashboardEvent> {
  return (async function* (): AsyncGenerator<DashboardEvent> {
    let deps: DashboardDeps;
    try {
      deps = await serverDeps(brandId);
    } catch (e) {
      console.error("answerQuestion setup", e);
      yield { type: "error", message: FRIENDLY_ERROR };
      return;
    }
    yield* answerWith(brandId, question, deps, previous);
  })();
}

/** Engine contract: rerankDashboard — the same dashboard under new weights, no AI call (US-007). */
export async function rerankDashboard(brandId: string, spec: DashboardSpec, weights: Pick<Weights, WeightDimension>): Promise<DashboardSpec> {
  const itemsP = loadCandidates(trendDb(), brandId, spec.intent ?? null);
  const [brand, display] = await Promise.all([loadBrand(brandId), displayOptions()]);
  const items = [...(await itemsP), ...editorialItems()];
  return rerankSpec(spec, items, { brandId, profile: brand.profile, weights, feedback: brand.feedback }, display);
}

/** Engine contract: getEvidence — the real records behind a chart element (US-009); FR-8 enforced in trend-store. */
export async function getEvidence(brandId: string, itemIds: number[]): Promise<TrendItem[]> {
  // negative ids are Blair's editorial signals (public, in memory); the rest come from trend_items
  const editorial = new Map(editorialItems().map((i) => [i.id, i]));
  const fromDb = await loadItemsByIds(trendDb(), brandId, itemIds.filter((id) => id > 0));
  const byId = new Map<number, TrendItem>([...fromDb.map((i): [number, TrendItem] => [i.id, i])]);
  for (const id of itemIds) if (id < 0 && editorial.has(id)) byId.set(id, editorial.get(id)!);
  return [...new Set(itemIds)].map((id) => byId.get(id)).filter((i): i is TrendItem => !!i);
}

/** The real dependencies: switchboard for AI, Supabase for data, saved_answers as the cache. */
async function serverDeps(brandId: string): Promise<DashboardDeps> {
  return {
    ...(await displayOptions()),
    ask: async (c) => (await ai().generateJSON({ ...c, schema: c.schema as Readonly<Record<string, unknown>> })).value,
    loadBrand: () => loadBrand(brandId),
    // the trend library plus Blair's runway/press signals (public, weighted by house)
    loadItems: async (_brandId, intent) => [...(await loadCandidates(trendDb(), brandId, intent)), ...editorialItems()],
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

/** Profile, weights (defaults if the brand hasn't saved any) and 👍/👎 feedback. */
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

/** Vocabulary labels, source names and color hexes for widget rows and footers. */
async function displayOptions(): Promise<Pick<DashboardDeps, "vocab" | "sourceNames" | "queryOptions">> {
  const [vocab, colorHex, sources] = await Promise.all([loadVocab(), loadColorHex(), db().from("sources").select("key, name")]);
  return {
    vocab,
    sourceNames: Object.fromEntries((sources.data ?? []).map((s) => [s.key as string, s.name as string])),
    queryOptions: { colorHex },
  };
}

let hexes: Promise<Record<string, string>> | undefined;

/** color id → hex from data/curation/colors.json, for color swatches. */
function loadColorHex(): Promise<Record<string, string>> {
  hexes ??= readFile(path.join(process.cwd(), "data", "curation", "colors.json"), "utf8")
    .then((s) => Object.fromEntries((JSON.parse(s).colors as { id: string; hex: string }[]).map((c) => [c.id, c.hex])))
    .catch(() => ({}));
  return hexes;
}
