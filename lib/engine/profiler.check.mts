// Self-check for the brand profiler — fake AI, real cleaning logic.
// Run: npx tsx lib/engine/profiler.check.mts   (uses data/curation if present, else a small stand-in)

import { existsSync, readFileSync } from "node:fs";
import type { BrandProfile } from "../contracts/types";
import { buildProfileFrom, cleanProfile, compactPages, parseProducts, typicalPriceRange, type CrawlPage, type ProfileVocab, type RawProfile } from "./profiler";

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

// Crawled store pages ("Title\nType\nTags\nPrice\nDescription"), shaped like a real catalog:
// a 200-item football collab crawled first, a few sweaters and trousers, and one $6000 gold ring.
const shopPage = (i: number, title: string, type: string, price: number, desc = "Relaxed fit. Made in Portugal.") => ({
  url: `https://shop.example/products/${i}`, kind: "product" as const,
  text: `${title}\nType: ${type}\nTags: dev-style-number-${i}, AltText_tagged, best_seller\nPrice: ${price}\n${desc}`,
});
const shop: CrawlPage[] = [
  { url: "https://shop.example/", kind: "other", text: "FREE delivery over $250 Shop New In Trending Gift Guide Menu Search Account Cart" },
  { url: "https://shop.example/pages/about", kind: "about", text: "FREE delivery over $250 Shop New In Trending Gift Guide Menu Search Account Cart About us: playful prints and romantic dresses, made to be worn loudly." },
  ...Array.from({ length: 200 }, (_, i) => shopPage(i, `Club Collab Cap ${i}`, "Hats", 80 + (i % 40))),
  ...Array.from({ length: 6 }, (_, i) => shopPage(100 + i, `Cable Knit Sweater ${i}`, "Sweaters", 250 + i * 10)),
  ...Array.from({ length: 4 }, (_, i) => shopPage(200 + i, `Pleated Trouser ${i}`, "Pants", 220 + i * 10)),
  shopPage(300, "14kt Gold Crest Ring", "Jewelry", 6000),
];

await test("catalog: every product type is sampled, not just the first ones crawled", () => {
  const t = compactPages(shop);
  expect(/211 products\. Types: Hats 200, Sweaters 6, Pants 4, Jewelry 1/.test(t), t.split("\n").find((l) => l.startsWith("[products]")) ?? "no overview line");
  expect(t.includes("Cable Knit Sweater 0") && t.includes("Pleated Trouser 0") && t.includes("14kt Gold Crest Ring"), "a type is missing from the sample");
  const hats = t.split("\n").filter((l) => l.includes("Club Collab Cap")).length;
  const sweaters = t.split("\n").filter((l) => l.includes("Cable Knit Sweater")).length;
  expect(sweaters === 6 && hats < 200, `sample not spread evenly (hats ${hats}, sweaters ${sweaters})`);
});

await test("catalog: merchandising tags never reach the AI", () => {
  const t = compactPages(shop);
  expect(!t.includes("dev-style-number") && !t.includes("AltText_tagged"), "tags leaked into the prompt");
});

await test("catalog: price range is the middle 80%, so one $6000 ring can't stretch it", () => {
  const r = typicalPriceRange(parseProducts(shop));
  expect(r !== null && r.min >= 80 && r.max < 1000 && r.median > 80, JSON.stringify(r));
  expect(typicalPriceRange(parseProducts(shop.slice(0, 5))) === null, "fewer than 5 prices should give no range");
});

await test("catalog: built profile uses the real price band, unless the founder edited it", async () => {
  const ask = async () => ({ ...messy, price_min: 30, price_max: 6000 });
  const p = await buildProfileFrom({ brandId: "b1", pages: shop, vocab: V, ask });
  const r = typicalPriceRange(parseProducts(shop))!;
  expect(p.price_min === r.min && p.price_max === r.max, `${p.price_min}–${p.price_max} vs ${r.min}–${r.max}`);
  const previous = { ...p, price_min: 10, price_max: 20, edited_fields: ["price_min", "price_max"] } as BrandProfile;
  const kept = await buildProfileFrom({ brandId: "b1", pages: shop, vocab: V, ask, previous });
  expect(kept.price_min === 10 && kept.price_max === 20, "edited prices were overwritten");
});

await test("about: menus shared with the home page are cut, the brand's words kept", () => {
  const about = compactPages(shop).split("\n").find((l) => l.startsWith("[about]")) ?? "";
  expect(about.startsWith("[about] About us: playful prints"), about);
});

await test("plain-text product pages still work as before", () => {
  expect(parseProducts(pages).length === 0 && compactPages(pages).includes("[product] Oatmeal linen midi dress"), "fallback broke");
});

console.log(existsSync("data/curation/style-tags.json") ? "vocab: Blair's data/curation" : "vocab: stand-in (data/curation not merged)");
process.exit(failures ? 1 : 0);
