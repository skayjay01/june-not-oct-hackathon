import "server-only";
import { ai } from "@/lib/ai";
import type { SocialPlatform } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { RESEARCH_PREFIX, RESEARCH_SCHEMA, RESEARCH_SYSTEM, researchPages, researchPrompt, type Research } from "./brand-research";

/**
 * Engine contract: researchBrand(brandId) — gathers what public sources say about the brand and
 * saves it to crawl_pages (replacing any earlier research), for when its own site can't be read.
 * Returns how many pages were saved; 0 = nothing found.
 */
export async function researchBrand(brandId: string): Promise<number> {
  const { data: brand, error } = await db().from("brands").select("name, website_url, social_links").eq("id", brandId).single();
  if (error) throw error;

  const { value } = await ai().generateJSON<Research>({
    step: "profile",
    schemaName: "brand_research",
    schema: RESEARCH_SCHEMA,
    system: RESEARCH_SYSTEM,
    prompt: researchPrompt({ name: brand.name, website: brand.website_url, socials: (brand.social_links ?? {}) as Partial<Record<SocialPlatform, string>> }),
    webSearch: 6,
    timeoutMs: 120_000,
    noCache: true,
  });
  const pages = researchPages(brand.name, value);

  const { error: clearError } = await db().from("crawl_pages").delete().eq("brand_id", brandId).like("url", `${RESEARCH_PREFIX}%`);
  if (clearError) throw clearError;
  if (!pages.length) return 0;
  const { error: saveError } = await db()
    .from("crawl_pages")
    .insert(pages.map((p) => ({ ...p, brand_id: brandId, fetched_at: new Date().toISOString() })));
  if (saveError) throw saveError;
  return pages.length;
}
