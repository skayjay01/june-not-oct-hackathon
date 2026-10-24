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
  for (const kind of Object.keys(BUDGET) as PageKind[]) {
    let left = BUDGET[kind];
    const seen = new Set<string>();
    for (const p of pages.filter((x) => x.kind === kind)) {
      const t = p.text.replace(/\s+/g, " ").trim();
      if (!t || seen.has(t) || left <= 0) continue;
      seen.add(t);
      const piece = t.slice(0, Math.min(left, 1500));
      out.push(`[${kind}] ${piece}`);
      left -= piece.length;
    }
  }
  return out.join("\n");
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
