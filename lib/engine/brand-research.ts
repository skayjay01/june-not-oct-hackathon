// When a brand's own site can't be read (bot walls on big retailers, empty pages), onboarding
// still goes ahead: a web search gathers what public sources say about the brand (its social
// profiles, Wikipedia, press, stores that stock it with real prices) and saves that as text the
// profiler reads like any crawled page. Pure: the server wiring is research-brand.ts.

import type { SocialPlatform } from "@/lib/contracts";

/** crawl_pages urls for text that did not come from reading the site: research and founder pastes. */
export const RESEARCH_PREFIX = "search:";
export const PASTED_SITE_URL = "pasted:site";

export type Research = {
  found: boolean;
  about: string | null;
  style: string | null;
  categories: string[];
  signature_items: string[];
  products: { title: string; type: string | null; price_usd: number | null; url: string | null }[];
  sources: { title: string; url: string }[];
};

const str = { type: "string" } as const;
const nullable = (type: "string" | "number") => ({ type: [type, "null"] }) as const;

export const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "about", "style", "categories", "signature_items", "products", "sources"],
  properties: {
    found: { type: "boolean" },
    about: nullable("string"),
    style: nullable("string"),
    categories: { type: "array", items: str },
    signature_items: { type: "array", items: str },
    products: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["title", "type", "price_usd", "url"], properties: { title: str, type: nullable("string"), price_usd: nullable("number"), url: nullable("string") } },
    },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "url"], properties: { title: str, url: str } } },
  },
} as const;

export const RESEARCH_SYSTEM = `You research a fashion brand so a trend tool can write its style profile. The brand's own website can't be read, so use other public sources: its social media profiles, Wikipedia, fashion press and interviews, and stores that stock it (with real product names and prices). Report only facts about this brand; never guess or fill in.
- found: false if you can't find this brand at all.
- about: 3 to 6 plain sentences on what it sells, who for, where it is based, its story and positioning.
- style: 2 to 4 sentences on its look: aesthetic, silhouettes, colors, materials, prints, signature details.
- categories: what it sells, e.g. dresses, knitwear, denim, bags.
- signature_items: up to 6 of its best-known products or lines.
- products: up to 12 real products it sells or recently sold, each with its product type, the price in US dollars (convert if needed; null if unknown) and the page you saw it on.
- sources: every page you used, with its title and link.`;

export function researchPrompt(brand: { name: string; website: string | null; socials?: Partial<Record<SocialPlatform, string>>; description?: string | null }): string {
  const accounts = Object.entries(brand.socials ?? {}).map(([p, url]) => `${p}: ${url}`);
  return [
    `Brand: "${brand.name.slice(0, 120)}"`,
    brand.website ? `Website (could not be read): ${brand.website}` : "",
    accounts.length ? `Its accounts:\n${accounts.join("\n")}` : "",
    brand.description ? `Known so far: ${brand.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const httpLink = (u: string | null | undefined) => {
  try {
    const url = new URL(String(u ?? "").trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * Research → crawl_pages rows. The overview is an "about" page (what the profiler weighs most);
 * each priced product is a "product" page in the crawler's own format, so the price range still
 * comes from real prices.
 */
export function researchPages(name: string, r: Research): { url: string; kind: "about" | "product"; text: string }[] {
  if (!r.found || !(r.about || r.style)) return [];
  const sources = r.sources.map((s) => ({ title: s.title.trim(), url: httpLink(s.url) })).filter((s): s is { title: string; url: string } => !!s.url);
  const about = [
    `About ${name}, from public sources (the brand's own site could not be read).`,
    r.about,
    r.style && `Style: ${r.style}`,
    r.categories.length ? `Sells: ${r.categories.join(", ")}` : "",
    r.signature_items.length ? `Best known for: ${r.signature_items.join("; ")}` : "",
    sources.length ? `Sources:\n${sources.map((s) => `- ${s.title} — ${s.url}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const seen = new Set<string>();
  const priced = (p: Research["products"][number]) => p.price_usd != null && Number.isFinite(p.price_usd) && p.price_usd > 0;
  // the profiler reads product pages only when each has a Type or a Price line, so rows without either are left out
  const products = r.products
    .filter((p) => p.title.trim() && (p.type?.trim() || priced(p)) && !seen.has(p.title.trim().toLowerCase()) && seen.add(p.title.trim().toLowerCase()))
    .slice(0, 12)
    .map((p, i) => ({
      url: `${RESEARCH_PREFIX}product:${i}:${httpLink(p.url) ?? ""}`,
      kind: "product" as const,
      text: [p.title.trim(), p.type?.trim() ? `Type: ${p.type.trim()}` : "", priced(p) ? `Price: ${Math.round(p.price_usd! * 100) / 100}` : ""].filter(Boolean).join("\n"),
    }));
  return [{ url: `${RESEARCH_PREFIX}about`, kind: "about", text: about }, ...products];
}

/** The sources listed in a saved research page, for the brand page to show. */
export function researchSources(aboutText: string): { title: string; url: string }[] {
  const block = aboutText.split("\nSources:\n")[1] ?? "";
  return block
    .split("\n")
    .map((l) => l.match(/^- (.*) — (https?:\/\/\S+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ title: m[1], url: m[2] }));
}

/** Text read from the brand's own site (not research, not pastes, not Instagram). */
export const isSitePage = (p: { url: string; kind: string }) => !p.url.startsWith(RESEARCH_PREFIX) && p.url !== PASTED_SITE_URL && !p.kind.startsWith("ig_");

/** Fewer than 3 pages read from the site itself: too little to know the brand, so research it. */
export const siteTextIsThin = (pages: { url: string; kind: string }[]) => pages.filter(isSitePage).length < 3;
