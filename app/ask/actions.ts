"use server";

import { WEIGHT_DIMENSIONS, checkWeights, type DashboardSpec, type TrendItem, type Weights } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { engine } from "@/lib/engine";
import { DEFAULT_WEIGHTS } from "@/lib/engine/build-digest";

// Evidence panel (US-009): the real records behind a chart element. FR-8 is enforced in the engine.
export async function loadEvidence(brandId: string, itemIds: number[]): Promise<TrendItem[]> {
  return engine.getEvidence(brandId, itemIds.slice(0, 100));
}

/** The brand's saved weights, or the defaults (US-007). */
export async function loadWeights(brandId: string): Promise<Pick<Weights, "preset" | (typeof WEIGHT_DIMENSIONS)[number]>> {
  const { data } = await db().from("weights").select("*").eq("brand_id", brandId).maybeSingle();
  return (data as Weights | null) ?? DEFAULT_WEIGHTS;
}

/** Same dashboard under new weights: no AI call (US-007). */
export async function rerank(brandId: string, spec: DashboardSpec, weights: Record<string, number>): Promise<DashboardSpec> {
  const w = Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, Math.round(Number(weights[d]))])) as Pick<Weights, (typeof WEIGHT_DIMENSIONS)[number]>;
  if (checkWeights({ brand_id: brandId, preset: null, ...w }).length) return spec;
  return engine.rerankDashboard(brandId, spec, w);
}
