import "server-only";
import { ai } from "@/lib/ai";
import { SOCIAL_PLATFORMS, type BrandPresence } from "@/lib/contracts";
import { findBrandPresence, type HomePage, type SearchAnswer } from "./brand-finder";

const nullableString = { type: ["string", "null"] } as const;

const SEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "website", "description", "socials", "alternatives"],
  properties: {
    name: nullableString,
    website: nullableString,
    description: nullableString,
    socials: {
      type: "object",
      additionalProperties: false,
      required: [...SOCIAL_PLATFORMS],
      properties: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, nullableString])),
    },
    alternatives: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "website"], properties: { name: { type: "string" }, website: { type: "string" } } },
    },
  },
} as const;

const SEARCH_SYSTEM = `You find a fashion brand's official online presence for a trend tool's sign-up form. Search the web.
- name: the brand's name as the brand writes it.
- website: the home page of the brand's own official site or store. Never Instagram, a marketplace, a stockist or a news article. null if you can't find it.
- description: one plain sentence on what the brand sells and where it is based, so the founder can recognise it. null if unknown.
- socials: full profile links to the brand's own official accounts on instagram, tiktok, pinterest, facebook, x and youtube. null for any you can't confirm; never a fan page, reseller or a different brand.
- alternatives: up to 3 other fashion brands with the same or a very similar name, with their websites, in case we picked the wrong one. [] if none.`;

async function search(name: string, website?: string): Promise<SearchAnswer | null> {
  try {
    const prompt = `Brand name: "${name.slice(0, 120)}"${website ? `\nIts website, from the founder: ${website}` : ""}`;
    const { value } = await ai().generateJSON<SearchAnswer>({ step: "profile", schemaName: "brand_presence", schema: SEARCH_SCHEMA, system: SEARCH_SYSTEM, prompt, webSearch: 4, timeoutMs: 40_000 });
    return value;
  } catch (e) {
    console.error("[findBrand] search failed", e);
    return null;
  }
}

/** A browser-like visit to the homepage only (one page, like a person opening the link). */
async function fetchHome(url: string): Promise<HomePage> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; AskATrendBot/0.1; +https://june-not-oct-hackathon.vercel.app)", accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    const html = (await res.text()).slice(0, 1_500_000);
    return { status: res.status, url: res.url || url, html };
  } catch {
    return null;
  }
}

/** Engine contract: findBrand(name, website?) — never throws; whatever isn't found comes back null for the form to ask. */
export async function findBrand(name: string, website?: string): Promise<BrandPresence> {
  return findBrandPresence(name, { search, fetchHome }, website);
}
