"use server";

import type { TrendItem } from "@/lib/contracts";
import { engine } from "@/lib/engine";

// Evidence panel (US-009): the real records behind a chart element. FR-8 is enforced in the engine.
export async function loadEvidence(brandId: string, itemIds: number[]): Promise<TrendItem[]> {
  return engine.getEvidence(brandId, itemIds.slice(0, 100));
}
