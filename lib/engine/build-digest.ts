import "server-only";
import { ai } from "@/lib/ai";
import type { BrandProfile, DigestSpec, Feedback, TrendItem, Weights } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { baselineRank, buildDigestFrom, type RankFn, type RawDigest } from "./digest";
import { loadVocab } from "./vocab";

/** Used until the brand saves its own weights (US-007). */
const DEFAULT_WEIGHTS = { preset: null, price_fit: 20, social_buzz: 20, growth_speed: 25, competitor_adoption: 15, style_fit: 20 } as const;

/**
 * Engine contract: buildDigest(brandId). Saves the digest to `digests` and returns it with `id`
 * set, so sendDigest can build 👍/👎 links. Pass `rank` to use A4's matcher (rankItems).
 */
export async function buildDigest(brandId: string, opts: { rank?: RankFn; windowDays?: number } = {}): Promise<DigestSpec> {
  const since = new Date(Date.now() - (opts.windowDays ?? 90) * 86_400_000).toISOString();
  const [profileRes, weightsRes, itemsRes, feedbackRes, vocab] = await Promise.all([
    db().from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
    db().from("weights").select("*").eq("brand_id", brandId).maybeSingle(),
    // public rows plus this brand's own licensed rows only (FR-8)
    db().from("trend_items").select("*").eq("type", "product").gte("collected_at", since).or(`brand_id.is.null,brand_id.eq.${brandId}`).limit(3000),
    db().from("feedback").select("brand_id, digest_id, item_key, vote").eq("brand_id", brandId),
    loadVocab(),
  ]);
  for (const r of [profileRes, weightsRes, itemsRes, feedbackRes]) if (r.error) throw r.error;
  if (!profileRes.data) throw new Error("This brand has no style profile yet — run buildProfile first");

  const spec = await buildDigestFrom({
    profile: profileRes.data as BrandProfile,
    weights: (weightsRes.data as Weights | null) ?? { brand_id: brandId, ...DEFAULT_WEIGHTS },
    items: (itemsRes.data ?? []) as TrendItem[],
    feedback: (feedbackRes.data ?? []) as Feedback[],
    colors: vocab.colors,
    rank: opts.rank ?? baselineRank,
    ask: async (c) => (await ai().generateJSON<RawDigest>({ ...c, step: "digest", schemaName: "digest", noCache: true })).value,
  });

  const { data, error } = await db().from("digests").insert({ brand_id: brandId, spec }).select("id").single();
  if (error) throw error;
  return { ...spec, id: data.id as string };
}
