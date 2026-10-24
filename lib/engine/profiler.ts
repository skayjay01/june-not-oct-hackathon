// A2 — brand profiler: crawled text → BrandProfile (PRD US-002, FR-1, FR-2).
//
// Reads the text Yizhi's crawler saved in crawl_pages (About Us, product text,
// image alt text, Instagram bio/captions — never images), asks the AI for a
// style profile using only Blair's vocabulary ids, cleans the answer, keeps
// any field the founder edited by hand, and saves it to brand_profiles.
//
// Pure logic lives in buildProfileFrom(); the database wiring is in
// buildProfile() so the logic can be tested without Supabase or AI keys.

import { brandProfileSchema, checkProfile, type BrandProfile } from "@/lib/contracts";

export type PageKind = "about" | "product" | "alt" | "ig_bio" | "ig_caption" | "other";
export interface CrawlPage {
  url: string;
  kind: PageKind;
  text: string;
}

interface VocabEntry {
  id: string;
  label: string;
  cues?: string[];
  family?: string;
}
export interface ProfileVocab {
  styleTags: VocabEntry[];
  categories: VocabEntry[];
  colors: VocabEntry[];
}

/** The AI's raw answer, before cleaning (matches brandProfileSchema). */
export interface RawProfile {
  style_tags: string[];
  price_min: number | null;
  price_max: number | null;
  currency: string;
  categories: string[];
  colors: string[];
  summary: string;
}

export type Ask = (call: { system: string; prompt: string; schema: typeof brandProfileSchema; validate: (v: RawProfile) => string[] }) => Promise<RawProfile>;

type EditableField = BrandProfile["edited_fields"][number];

// How much of each kind of text to send. About Us says the most about style; product
// text gives price and category; captions are noisy. ~24k characters ≈ 6k tokens.
const BUDGET: Record<PageKind, number> = { about: 6000, product: 9000, alt: 2500, ig_bio: 1000, ig_caption: 3500, other: 2000 };

export function compactPages(pages: CrawlPage[]): string {
  const out: string[] = [];
  const shared = pages.filter((p) => p.kind === "other").map((p) => flat(p.text));
  const catalog = parseProducts(pages);
  for (const kind of Object.keys(BUDGET) as PageKind[]) {
    if (kind === "product" && catalog.length) {
      out.push(catalogDigest(catalog, BUDGET.product));
      continue;
    }
    let left = BUDGET[kind];
    const seen = new Set<string>();
    for (const p of pages.filter((x) => x.kind === kind)) {
      // About pages often start with the same menus and banners as the home page; drop that shared lead-in
      const t = kind === "about" ? stripSharedLead(flat(p.text), shared) : flat(p.text);
      if (!t || seen.has(t) || left <= 0) continue;
      seen.add(t);
      const piece = t.slice(0, Math.min(left, 1500));
      out.push(`[${kind}] ${piece}`);
      left -= piece.length;
    }
  }
  return out.join("\n");
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** Removes the longest lead-in (≥ 40 chars) this text shares with any of `others`. */
function stripSharedLead(text: string, others: string[]): string {
  let cut = 0;
  for (const o of others) {
    let i = 0;
    while (i < text.length && i < o.length && text[i] === o[i]) i++;
    if (i >= 40 && i > cut) cut = i;
  }
  return text.slice(cut).trim() || text;
}

// ---------- product catalog ----------

export interface CatalogItem {
  title: string;
  type: string | null;
  price: number | null;
  description: string;
}

/**
 * Product pages saved by the crawler as "Title\nType: …\nTags: …\nPrice: …\nDescription".
 * Pages without that shape are left to the plain-text path. Tags are dropped: they are mostly
 * internal merchandising codes.
 */
export function parseProducts(pages: CrawlPage[]): CatalogItem[] {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (p.kind !== "product") continue;
    const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const field = (name: string) => lines.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2).trim() ?? null;
    const type = field("Type");
    const priceText = field("Price");
    if (type === null && priceText === null) return []; // not the structured format: use plain text for all
    const title = lines[0];
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const price = priceText !== null && Number.isFinite(Number(priceText)) ? Number(priceText) : null;
    const description = flat(lines.slice(1).filter((l) => !/^(Type|Tags|Price): /.test(l)).join(" "));
    items.push({ title, type: type || null, price, description });
  }
  return items;
}

/** The middle 80% of prices (10th–90th percentile), so one couture piece can't stretch the range. Needs 5+ prices. */
export function typicalPriceRange(items: CatalogItem[]): { min: number; max: number; median: number } | null {
  const prices = items.map((i) => i.price).filter((p): p is number => p !== null && p > 0).sort((a, b) => a - b);
  if (prices.length < 5) return null;
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.floor(q * prices.length))];
  return { min: Math.round(at(0.1)), max: Math.round(at(0.9)), median: Math.round(at(0.5)) };
}

/** Whole-catalog overview plus a sample spread evenly across product types, within `budget` characters. */
function catalogDigest(items: CatalogItem[], budget: number): string {
  const byType = new Map<string, CatalogItem[]>();
  for (const i of items) byType.set(i.type ?? "Other", [...(byType.get(i.type ?? "Other") ?? []), i]);
  const types = [...byType].sort((a, b) => b[1].length - a[1].length);
  const range = typicalPriceRange(items);
  const head = [
    `[products] ${items.length} products. Types: ${types.map(([t, xs]) => `${t} ${xs.length}`).join(", ")}.`,
    range ? `Typical price ${range.min}–${range.max} (median ${range.median}).` : "",
  ].join(" ");

  // round-robin over types so the sample mirrors the catalog's breadth, not the crawl order
  const lines: string[] = [];
  let left = budget - head.length;
  for (let round = 0; left > 0; round++) {
    let added = false;
    for (const [, xs] of types) {
      const i = xs[round];
      if (!i) continue;
      const line = `[product] ${i.title} (${i.type ?? "Other"}${i.price !== null ? `, ${i.price}` : ""}) ${i.description.slice(0, 160)}`;
      if (line.length > left) {
        left = 0;
        break;
      }
      lines.push(line);
      left -= line.length + 1;
      added = true;
    }
    if (!added) break;
  }
  return [head, ...lines].join("\n");
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Map whatever the AI wrote (an id, a label, odd casing) onto known ids; drop the rest. */
function toIds(values: string[], vocab: VocabEntry[]): string[] {
  const byKey = new Map<string, string>();
  for (const v of vocab) {
    byKey.set(slug(v.id), v.id);
    byKey.set(slug(v.label), v.id);
  }
  const out: string[] = [];
  for (const raw of values) {
    const id = byKey.get(slug(String(raw)));
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function cleanProfile(raw: RawProfile, vocab: ProfileVocab): Omit<RawProfile, "summary"> & { summary: string | null } {
  let min = typeof raw.price_min === "number" && raw.price_min >= 0 ? Math.round(raw.price_min) : null;
  let max = typeof raw.price_max === "number" && raw.price_max >= 0 ? Math.round(raw.price_max) : null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return {
    style_tags: toIds(raw.style_tags ?? [], vocab.styleTags).slice(0, 5),
    categories: toIds(raw.categories ?? [], vocab.categories).slice(0, 8),
    colors: toIds(raw.colors ?? [], vocab.colors).slice(0, 8),
    price_min: min,
    price_max: max,
    currency: /^[A-Z]{3}$/.test(raw.currency ?? "") ? raw.currency : "USD",
    summary: raw.summary?.trim() || null,
  };
}

const list = (v: VocabEntry[], withCues = false) =>
  v.map((x) => (withCues && x.cues?.length ? `${x.id} (${x.label}; cues: ${x.cues.slice(0, 5).join(", ")})` : `${x.id} (${x.label})`)).join("\n");

export function profilePrompt(pages: CrawlPage[], vocab: ProfileVocab) {
  const system = [
    "You are a fashion merchandiser describing a brand's style from its own words.",
    "Use only the brand text provided. Do not guess from the brand name or outside knowledge.",
    "Pick 3 to 5 style_tags, the brand's core categories, and up to 6 typical colors, using ONLY ids from the lists given.",
    "price_min and price_max are the typical price range of its products in the stated currency (null if the text shows no prices).",
    "summary: 2 sentences a founder would recognise, mentioning one or two words the brand itself uses.",
  ].join(" ");
  const prompt = [
    "STYLE TAG IDS:",
    list(vocab.styleTags, true),
    "",
    "CATEGORY IDS:",
    list(vocab.categories),
    "",
    "COLOR IDS:",
    list(vocab.colors),
    "",
    "BRAND TEXT (from its website and Instagram):",
    compactPages(pages),
  ].join("\n");
  return { system, prompt };
}

/** Pure core: pages + vocab + the founder's previous profile → new profile. */
export async function buildProfileFrom(opts: {
  brandId: string;
  pages: CrawlPage[];
  vocab: ProfileVocab;
  ask: Ask;
  previous?: BrandProfile | null;
  now?: () => Date;
}): Promise<BrandProfile> {
  const { brandId, pages, vocab, ask, previous } = opts;
  if (!pages.some((p) => p.text.trim())) throw new Error("No crawled text for this brand yet — run the crawl first");

  const idSets = {
    styleTags: new Set(vocab.styleTags.map((v) => v.id)),
    categories: new Set(vocab.categories.map((v) => v.id)),
    colors: new Set(vocab.colors.map((v) => v.id)),
  };
  const { system, prompt } = profilePrompt(pages, vocab);
  // The AI must land at least 3 usable style tags after cleaning; otherwise the switchboard retries / fails over.
  const validate = (v: RawProfile) => {
    const c = cleanProfile(v, vocab);
    return checkProfile(c, idSets).filter((e) => !e.startsWith("colors") && !e.startsWith("categories"));
  };
  const cleaned = cleanProfile(await ask({ system, prompt, schema: brandProfileSchema, validate }), vocab);
  // real catalog prices beat the AI's reading of a handful of them
  const range = typicalPriceRange(parseProducts(pages));
  if (range) [cleaned.price_min, cleaned.price_max] = [range.min, range.max];

  const edited = new Set<EditableField>(previous?.edited_fields ?? []);
  const keep = <K extends EditableField>(k: K, fresh: BrandProfile[K]): BrandProfile[K] => (previous && edited.has(k) ? previous[k] : fresh);

  return {
    brand_id: brandId,
    style_tags: keep("style_tags", cleaned.style_tags),
    price_min: keep("price_min", cleaned.price_min),
    price_max: keep("price_max", cleaned.price_max),
    currency: keep("currency", cleaned.currency),
    categories: keep("categories", cleaned.categories),
    colors: keep("colors", cleaned.colors),
    summary: keep("summary", cleaned.summary),
    edited_fields: [...edited],
    updated_at: (opts.now ?? (() => new Date()))().toISOString(),
  };
}
