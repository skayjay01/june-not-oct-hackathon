import "server-only";
import { db } from "@/lib/db/server";
import { engine } from "@/lib/engine";
import { siteTextIsThin } from "@/lib/engine/brand-research";
import { crawlBrand } from "./crawl-brand";

// Onboarding pipeline (US-001 → US-002): read the brand's site, then have the engine write
// its style profile. Runs in the background after the form is submitted. brands.crawl_status
// stays "running" for the whole pipeline; the brand page tells "reading" from "profiling" by
// whether any pages (not pasted Instagram text) exist yet.
//
// A site we can't read (bot walls on big retailers) or that says too little doesn't stop it:
// the engine researches the brand in public sources (social profiles, press, stockists) and the
// profile is written from that plus anything the founder pasted. It fails only when there is
// nothing at all to go on.

export async function runOnboarding(brandId: string) {
  try {
    await db().from("brands").update({ crawl_status: "running" }).eq("id", brandId);
    try {
      await crawlBrand(brandId, { setStatus: false });
    } catch (e) {
      console.error(`[onboarding ${brandId}] site crawl failed; using public sources`, e);
    }

    const pages = async () => {
      const { data, error } = await db().from("crawl_pages").select("url, kind").eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    };
    if (siteTextIsThin(await pages())) {
      try {
        await engine.researchBrand(brandId);
      } catch (e) {
        console.error(`[onboarding ${brandId}] public-source research failed`, e);
      }
    }
    if (!(await pages()).length) throw new Error("nothing to read: the site, public sources and pastes were all empty");

    await engine.buildProfile(brandId);
    await db().from("brands").update({ crawl_status: "done" }).eq("id", brandId);
  } catch (e) {
    console.error(`[onboarding ${brandId}]`, e);
    await db().from("brands").update({ crawl_status: "failed" }).eq("id", brandId);
  }
}
