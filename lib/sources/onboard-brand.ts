import "server-only";
import { db } from "@/lib/db/server";
import { engine } from "@/lib/engine";
import { crawlBrand } from "./crawl-brand";

// Onboarding pipeline (US-001 → US-002): read the brand's site, then have the engine write
// its style profile. Runs in the background after the form is submitted. brands.crawl_status
// stays "running" for the whole pipeline; the brand page tells "reading" from "profiling" by
// whether any site pages (not pasted Instagram text) exist yet.

export async function runOnboarding(brandId: string) {
  try {
    await db().from("brands").update({ crawl_status: "running" }).eq("id", brandId);
    await crawlBrand(brandId, { setStatus: false });
    // Pasted Instagram text counts too, so a site we couldn't read doesn't stop the profile.
    const { count, error } = await db()
      .from("crawl_pages")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId);
    if (error) throw error;
    if (!count) throw new Error("no readable text found on the site");

    await engine.buildProfile(brandId);
    await db().from("brands").update({ crawl_status: "done" }).eq("id", brandId);
  } catch (e) {
    console.error(`[onboarding ${brandId}]`, e);
    await db().from("brands").update({ crawl_status: "failed" }).eq("id", brandId);
  }
}
