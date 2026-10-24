import "server-only";
import { db } from "@/lib/db/server";
import { collectBrandPages } from "./brand-site";
import { recordRun, sourceEnabled } from "./registry";

// Contract function (tasks/build-plan.md): crawlBrand(brandId) saves the brand's page text
// into crawl_pages for the engine's buildProfile(brandId).

export async function crawlBrand(brandId: string) {
  const { data: brand, error } = await db()
    .from("brands")
    .select("id, website_url, extra_urls")
    .eq("id", brandId)
    .single();
  if (error) throw error;

  if (!(await sourceEnabled("brand_site"))) {
    await db().from("brands").update({ crawl_status: "failed" }).eq("id", brandId);
    return { saved: 0, skipped: [{ url: brand.website_url, reason: "brand_site source is switched off" }] };
  }

  await db().from("brands").update({ crawl_status: "running" }).eq("id", brandId);
  try {
    const { pages, skipped } = await collectBrandPages(brand.website_url, brand.extra_urls ?? []);
    if (pages.length) {
      const { error: upsertError } = await db()
        .from("crawl_pages")
        .upsert(
          pages.map((p) => ({ ...p, brand_id: brandId, fetched_at: new Date().toISOString() })),
          { onConflict: "brand_id,url,kind" },
        );
      if (upsertError) throw upsertError;
    }
    const status = pages.length ? "done" : "failed";
    await db().from("brands").update({ crawl_status: status }).eq("id", brandId);
    await recordRun("brand_site", pages.length ? undefined : "no pages collected");
    return { saved: pages.length, skipped };
  } catch (e) {
    await db().from("brands").update({ crawl_status: "failed" }).eq("id", brandId);
    await recordRun("brand_site", e instanceof Error ? e.message : String(e));
    throw e;
  }
}
