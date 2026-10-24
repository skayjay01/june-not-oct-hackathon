import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WEIGHT_DIMENSIONS, type BrandProfile } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { crawlBrand } from "@/lib/sources/crawl-brand";
import { questionHash } from "./dashboard-builder";
import type { DemoBrand } from "./demo-plan";
import { engine } from "./index";
import type { PregenDeps } from "./pregenerate";

/** The real database, crawler and engine behind the demo pre-generator (US-006). */
export function serverPregenDeps(log: (line: string) => void): PregenDeps {
  return {
    log,
    ensureBrand: async (b) => {
      const found = await db().from("brands").select("id").eq("website_url", b.website_url).maybeSingle();
      if (found.error) throw found.error;
      if (found.data) return found.data.id as string;
      const made = await db().from("brands").insert({ name: b.name, website_url: b.website_url }).select("id").single();
      if (made.error) throw made.error;
      return made.data.id as string;
    },
    crawl: (brandId) => crawlBrand(brandId),
    buildProfile: (brandId) => engine.buildProfile(brandId),
    seedProfile: async (brandId, b) => {
      // marked as edited so a later crawl + buildProfile never overwrites the hand-entered fields
      const profile: Omit<BrandProfile, "updated_at"> = {
        brand_id: brandId, style_tags: b.seed.style_tags, price_min: b.seed.price_min, price_max: b.seed.price_max,
        currency: "USD", categories: [], colors: [], summary: b.seed.summary,
        edited_fields: ["style_tags", "price_min", "price_max", "summary"],
      };
      const { error } = await db().from("brand_profiles").upsert(profile, { onConflict: "brand_id" });
      if (error) throw error;
    },
    setWeights: async (brandId, presetId) => {
      const preset = (await loadPresets()).find((p) => p.id === presetId);
      if (!preset) throw new Error(`preset "${presetId}" not found in data/curation/presets.json`);
      const row = { brand_id: brandId, preset: presetId, ...Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, preset[d]])) };
      const { error } = await db().from("weights").upsert(row, { onConflict: "brand_id" });
      if (error) throw error;
    },
    buildDigest: (brandId) => engine.buildDigest(brandId),
    answer: (brandId, question) => engine.answerQuestion(brandId, question),
    markDemo: async (brandId, question) => {
      const { error } = await db().from("saved_answers").update({ is_demo: true }).eq("question_hash", questionHash(brandId, question));
      if (error) throw error;
    },
  };
}

type Preset = { id: DemoBrand["preset"] } & Record<(typeof WEIGHT_DIMENSIONS)[number], number>;

async function loadPresets(): Promise<Preset[]> {
  const file = path.join(process.cwd(), "data", "curation", "presets.json");
  const json = await readFile(file, "utf8").catch(() => {
    throw new Error("data/curation/presets.json is missing (Blair's C5)");
  });
  return JSON.parse(json).presets as Preset[];
}
