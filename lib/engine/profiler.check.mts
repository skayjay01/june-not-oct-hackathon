// Self-check for the brand profiler — fake AI, real cleaning logic.
// Run: npx tsx lib/engine/profiler.check.mts   (uses data/curation if present, else a small stand-in)

import { existsSync, readFileSync } from "node:fs";
import type { BrandProfile } from "../contracts/types";
import { buildProfileFrom, cleanProfile, compactPages, type CrawlPage, type ProfileVocab, type RawProfile } from "./profiler";

function vocab(): ProfileVocab {
  const dir = "data/curation";
  if (existsSync(`${dir}/style-tags.json`)) {
    const read = (f: string, k: string) =>
      (JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))[k] as { id: string; label?: string; name?: string; cues?: string[] }[]).map((x) => ({
        id: x.id,
        label: x.label ?? x.name ?? x.id,
        cues: x.cues,
      }));
    return { styleTags: read("style-tags.json", "tags"), categories: read("categories.json", "categories"), colors: read("colors.json", "colors") };
  }
  const v = (ids: string[]) => ids.map((id) => ({ id, label: id.replace(/-/g, " ") }));
  return {
    styleTags: v(["minimalist", "quiet-luxury", "scandi", "streetwear", "boho"]),
    categories: v(["dresses", "tops", "knitwear", "trousers"]),
    colors: [...v(["oatmeal", "cloud-dancer", "butter-yellow"]), { id: "cherry-red", label: "Cherry red" }],
  };
}
const V = vocab();

const pages: CrawlPage[] = [
  { url: "https://demo.example/about", kind: "about", text: "We make effortless, logo-free capsule essentials in linen and cashmere. Designed in Copenhagen." },
  { url: "https://demo.example/p/1", kind: "product", text: "Oatmeal linen midi dress — $68" },
  { url: "https://demo.example/p/2", kind: "product", text: "Cloud cashmere crew — $89" },
  { url: "https://demo.example/p/2", kind: "product", text: "Cloud cashmere crew — $89" }, // duplicate text
  { url: "https://instagram.com/demo", kind: "ig_caption", text: "Quiet colours for slow mornings." },
];

let failures = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
  }
}
const expect = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};

const messy: RawProfile = {
  style_tags: ["Minimalist", "quiet luxury", "SCANDI", "made-up-vibe", "minimalist"],
  price_min: 89,
  price_max: 68,
  currency: "usd",
  categories: ["Dresses", "knitwear", "spaceships"],
  colors: ["Oatmeal", "cloud-dancer", "neon sparkle"],
  summary: "  Effortless capsule essentials in soft neutrals.  ",
};

await test("compactPages labels kinds and drops duplicate text", () => {
  const t = compactPages(pages);
  expect(t.includes("[about]") && t.includes("[product]") && t.includes("[ig_caption]"), "missing kind labels");
  expect(t.split("Cloud cashmere crew").length === 2, "duplicate product text kept");
});

await test("cleanProfile maps labels to ids, drops unknowns, fixes prices and currency", () => {
  const c = cleanProfile(messy, V);
  expect(JSON.stringify(c.style_tags) === JSON.stringify(["minimalist", "quiet-luxury", "scandi"]), `style_tags ${JSON.stringify(c.style_tags)}`);
  expect(!c.categories.includes("spaceships") && c.categories.includes("dresses"), `categories ${JSON.stringify(c.categories)}`);
  expect(JSON.stringify(c.colors) === JSON.stringify(["oatmeal", "cloud-dancer"]), `colors ${JSON.stringify(c.colors)}`);
  expect(c.price_min === 68 && c.price_max === 89, "prices not reordered");
  expect(c.currency === "USD" && c.summary === "Effortless capsule essentials in soft neutrals.", "currency/summary not cleaned");
});

await test("prompt lists only allowed ids and includes the brand text", async () => {
  let seen = "";
  await buildProfileFrom({ brandId: "b1", pages, vocab: V, ask: async (c) => ((seen = c.prompt), messy) });
  expect(seen.includes("quiet-luxury") && seen.includes("Designed in Copenhagen"), "prompt missing vocab or brand text");
});

await test("validate rejects an answer with fewer than 3 usable style tags", async () => {
  let problems: string[] = [];
  await buildProfileFrom({
    brandId: "b1", pages, vocab: V,
    ask: async (c) => {
      problems = c.validate({ ...messy, style_tags: ["minimalist", "made-up-vibe"] });
      return messy;
    },
  });
  expect(problems.some((p) => p.includes("3–5 style tags")), `got ${JSON.stringify(problems)}`);
});

await test("fields the founder edited survive a re-profile", async () => {
  const previous: BrandProfile = {
    brand_id: "b1", style_tags: ["boho", "romantic", "vintage"], price_min: 120, price_max: 300, currency: "EUR",
    categories: ["dresses"], colors: ["cherry-red"], summary: "Founder's own words.", edited_fields: ["style_tags", "summary"],
    updated_at: "2026-10-01T00:00:00Z",
  };
  const p = await buildProfileFrom({ brandId: "b1", pages, vocab: V, previous, ask: async () => messy, now: () => new Date("2026-10-24T00:00:00Z") });
  expect(JSON.stringify(p.style_tags) === JSON.stringify(previous.style_tags), "edited style_tags overwritten");
  expect(p.summary === "Founder's own words.", "edited summary overwritten");
  expect(p.price_min === 68 && p.currency === "USD", "unedited fields should refresh");
  expect(p.edited_fields.length === 2 && p.updated_at === "2026-10-24T00:00:00.000Z", "edited_fields/updated_at wrong");
});

await test("no crawled text gives a clear error", async () => {
  try {
    await buildProfileFrom({ brandId: "b1", pages: [], vocab: V, ask: async () => messy });
    throw new Error("should have thrown");
  } catch (e) {
    expect((e as Error).message.includes("run the crawl first"), (e as Error).message);
  }
});

console.log(existsSync("data/curation/style-tags.json") ? "vocab: Blair's data/curation" : "vocab: stand-in (data/curation not merged)");
process.exit(failures ? 1 : 0);
