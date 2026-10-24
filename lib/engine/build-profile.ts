import "server-only";
import { ai } from "@/lib/ai";
import type { BrandProfile } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { buildProfileFrom, type CrawlPage, type RawProfile } from "./profiler";
import { loadVocab } from "./vocab";

/** Engine contract: buildProfile(brandId) — reads crawl_pages, writes brand_profiles. */
export async function buildProfile(brandId: string): Promise<BrandProfile> {
  const [{ data: pages, error: pagesErr }, { data: previous, error: prevErr }, vocab] = await Promise.all([
    db().from("crawl_pages").select("url, kind, text").eq("brand_id", brandId),
    db().from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
    loadVocab(),
  ]);
  if (pagesErr) throw pagesErr;
  if (prevErr) throw prevErr;

  const profile = await buildProfileFrom({
    brandId,
    pages: (pages ?? []) as CrawlPage[],
    vocab,
    previous: previous as BrandProfile | null,
    ask: async (c) => (await ai().generateJSON<RawProfile>({ ...c, step: "profile", schemaName: "brand_profile", noCache: true })).value,
  });

  const { error } = await db().from("brand_profiles").upsert(profile, { onConflict: "brand_id" });
  if (error) throw error;
  return profile;
}
