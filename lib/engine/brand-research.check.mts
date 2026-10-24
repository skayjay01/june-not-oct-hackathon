// Self-check for public-source research (sites we can't read). No network or AI.
// Run: npx tsx lib/engine/brand-research.check.mts  (exits 1 on any problem)

import { PASTED_SITE_URL, researchPages, researchSources, siteTextIsThin, type Research } from "./brand-research";
import { compactPages, parseProducts, typicalPriceRange, type CrawlPage } from "./profiler";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

const zara: Research = {
  found: true,
  about: "Zara is a Spanish fast-fashion retailer owned by Inditex, founded in 1975 in A Coruña.",
  style: "Trend-led, minimal basics alongside runway-inspired pieces; lots of black, white and neutrals.",
  categories: ["dresses", "outerwear", "denim"],
  signature_items: ["Tailored blazers", "Satin slip dresses"],
  products: [
    { title: "Oversized wool blend coat", type: "coat", price_usd: 159.9, url: "https://www.example-stockist.com/coat" },
    { title: "Satin slip dress", type: "dress", price_usd: 49.9, url: null },
    { title: "Straight-leg jeans", type: "jeans", price_usd: 45.9, url: "https://news.example.com/a" },
    { title: "Linen shirt", type: "shirt", price_usd: 35.9, url: null },
    { title: "Leather ankle boots", type: "boots", price_usd: 89.9, url: null },
    { title: "Satin slip dress", type: "dress", price_usd: 49.9, url: null },
    { title: "Mystery item", type: null, price_usd: null, url: null },
  ],
  sources: [
    { title: "Zara - Wikipedia", url: "https://en.wikipedia.org/wiki/Zara_(retailer)" },
    { title: "bad link", url: "javascript:alert(1)" },
  ],
};
const rows = researchPages("ZARA", zara);
const about = rows.find((r) => r.kind === "about")!;
expect("research: one overview page plus one page per priced product", rows.length === 6 && rows.filter((r) => r.kind === "product").length === 5, JSON.stringify(rows.map((r) => r.url)));
expect("research: duplicates and products with no type or price are left out", !rows.some((r) => r.text.startsWith("Mystery")) && rows.filter((r) => r.text.startsWith("Satin slip")).length === 1);
expect("research: overview says it's from public sources and lists real links only", about.text.includes("from public sources") && researchSources(about.text).length === 1 && researchSources(about.text)[0].url.startsWith("https://en.wikipedia.org"), about.text);

// The seam: the profiler must read research products as a catalog, with a real price range.
const pages: CrawlPage[] = rows.map((r) => ({ url: r.url, kind: r.kind, text: r.text }));
const catalog = parseProducts(pages);
expect("profiler: reads research products as a catalog", catalog.length === 5 && catalog.every((c) => c.price !== null && c.type), JSON.stringify(catalog));
expect("profiler: price range comes from the researched prices", JSON.stringify(typicalPriceRange(catalog)) === JSON.stringify({ min: 36, max: 160, median: 50 }), JSON.stringify(typicalPriceRange(catalog)));
expect("profiler: overview text reaches the prompt", compactPages(pages).includes("Spanish fast-fashion retailer"));
const mixed: CrawlPage[] = [...pages, { url: "https://shop.example.com/p/1", kind: "product", text: "Shirt\nType: shirt\nPrice: 30" }];
expect("profiler: research and crawled products read together", parseProducts(mixed).length === 6);

expect("not found: nothing saved", researchPages("Zzqx", { ...zara, found: false }).length === 0 && researchPages("Zzqx", { ...zara, about: null, style: null }).length === 0);

// When to research
const site = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://brand.com/p/${i}`, kind: "product" }));
expect("thin: a blocked site (nothing read) is researched", siteTextIsThin([]));
expect("thin: pastes, Instagram text and earlier research don't count as reading the site", siteTextIsThin([{ url: PASTED_SITE_URL, kind: "about" }, { url: "https://www.instagram.com/x/", kind: "ig_caption" }, { url: "search:about", kind: "about" }, ...site(2)]));
expect("thin: a site we read properly is not researched", !siteTextIsThin(site(3)));

process.exit(bad ? 1 : 0);
