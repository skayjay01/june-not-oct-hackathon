// A6 — digest builder: picks 2–4 trends that fit a brand, each backed by 3–5 real
// products (PRD US-004, FR-3 to FR-6).
//
// 1. Rank candidate items for the brand (A4's matcher when wired; a simple baseline here).
// 2. Group them into candidate trend elements by color / silhouette / material / pattern.
// 3. The AI chooses and explains 2–4 elements, picking examples only from ids we supply.
// 4. Clean: only supplied ids, colors from the fixed list, 3–5 examples, 2–4 elements,
//    skipping anything the founder gave a 👎.

import { checkDigest, digestPlanSchema, WEIGHT_DIMENSIONS, type BrandProfile, type DigestElement, type DigestSpec, type Feedback, type TrendItem, type Weights } from "@/lib/contracts";

export interface Ranked {
  item: TrendItem;
  score: number;
}
export type RankFn = (items: TrendItem[], ctx: { profile: BrandProfile; weights: Weights; feedback?: Feedback[] }) => Ranked[];

export interface ColorEntry {
  id: string;
  label: string;
}

type GroupAttr = "colors" | "silhouette" | "material" | "pattern";
export interface CandidateGroup {
  key: string; // e.g. "colors.butter-yellow" — no ":" so per-item feedback keys stay `${key}:${itemId}`
  attr: GroupAttr;
  value: string;
  score: number; // sum of top member scores
  growth: number | null; // mean growth of members that report it
  items: Ranked[];
}

/** The AI's raw answer (digestPlanSchema). */
export interface RawDigest {
  headline: string;
  elements: { key: string; name: string; color: string | null; reason: string; fits_because: string; example_ids: number[] }[];
}
export type AskDigest = (call: { system: string; prompt: string; schema: typeof digestPlanSchema; validate: (v: RawDigest) => string[] }) => Promise<RawDigest>;

// ---------- baseline ranking (replaced by A4's rankItems when it lands) ----------

const overlap = (a: string[] = [], b: string[] = []) => (a.length && b.length ? a.filter((x) => b.includes(x)).length / Math.min(a.length, b.length) : 0);

export const baselineRank: RankFn = (items, { profile, weights }) => {
  const total = WEIGHT_DIMENSIONS.reduce((s, k) => s + weights[k], 0) || 100;
  const w = (k: (typeof WEIGHT_DIMENSIONS)[number]) => weights[k] / total;
  return items
    .map((item) => {
      const a = item.attributes;
      const styleFit = Math.max(overlap(a.style_tags, profile.style_tags), overlap(a.colors, profile.colors) * 0.6, item.category && profile.categories.includes(item.category) ? 0.4 : 0);
      const lo = profile.price_min ?? 0;
      const hi = profile.price_max ?? Infinity;
      const priceFit = item.price == null ? 0.5 : item.price >= lo * 0.8 && item.price <= hi * 1.2 ? 1 : 0;
      const growth = Math.max(0, Math.min(1, (item.metrics.growth ?? 0) / 0.6));
      const buzz = Math.max(0, Math.min(1, (item.metrics.search_interest ?? 0) / 100));
      const adoption = Math.max(0, Math.min(1, (item.metrics.store_count ?? 0) / 15));
      const score = w("style_fit") * styleFit + w("price_fit") * priceFit + w("growth_speed") * growth + w("social_buzz") * buzz + w("competitor_adoption") * adoption;
      return { item, score };
    })
    .sort((x, y) => y.score - x.score);
};

// ---------- grouping ----------

export function groupCandidates(ranked: Ranked[], opts: { maxGroups?: number; perGroup?: number; dislikedKeys?: Set<string> } = {}): CandidateGroup[] {
  const maxGroups = opts.maxGroups ?? 8;
  const perGroup = opts.perGroup ?? 6;
  const groups = new Map<string, CandidateGroup>();
  for (const r of ranked) {
    if (r.item.type !== "product" || !r.item.image_url) continue; // digests show real, pictured products
    const a = r.item.attributes;
    const values: [GroupAttr, string][] = [
      ...(a.colors ?? []).map((c): [GroupAttr, string] => ["colors", c]),
      ...(["silhouette", "material", "pattern"] as const).filter((k) => a[k]).map((k): [GroupAttr, string] => [k, a[k] as string]),
    ];
    for (const [attr, value] of values) {
      const key = `${attr}.${value}`;
      if (opts.dislikedKeys?.has(key)) continue;
      const g = groups.get(key) ?? { key, attr, value, score: 0, growth: null, items: [] };
      if (g.items.length < perGroup) g.items.push(r);
      groups.set(key, g);
    }
  }
  const out = [...groups.values()].filter((g) => g.items.length >= 3);
  for (const g of out) {
    g.score = g.items.slice(0, 5).reduce((s, r) => s + r.score, 0);
    const gs = g.items.map((r) => r.item.metrics.growth).filter((x): x is number => typeof x === "number");
    g.growth = gs.length ? gs.reduce((s, x) => s + x, 0) / gs.length : null;
  }
  return out.sort((x, y) => y.score - x.score).slice(0, maxGroups);
}

// ---------- prompt ----------

export function digestPrompt(profile: BrandProfile, groups: CandidateGroup[], colors: ColorEntry[]) {
  const system = [
    "You are a trend scout writing a short weekly digest for a fashion brand founder.",
    "Choose 2 to 4 of the candidate trends that best fit this brand, and explain each in plain language.",
    "Use ONLY the candidates and item ids given. Each element's example_ids must be 3 to 5 ids from that candidate's items.",
    "Set key to the candidate key exactly. color must be a color id from the list, or null when the trend is not a color.",
    "reason: one sentence on why it's trending, citing the numbers given. fits_because: one sentence on why it suits this brand.",
    "headline: one line summarising the digest.",
  ].join(" ");
  const pct = (g: number | null) => (g == null ? "n/a" : `${Math.round(g * 100)}%`);
  const prompt = [
    `BRAND: style ${profile.style_tags.join(", ")}; categories ${profile.categories.join(", ")}; colors ${profile.colors.join(", ")}; price ${profile.price_min ?? "?"}–${profile.price_max ?? "?"} ${profile.currency}.`,
    profile.summary ? `BRAND SUMMARY: ${profile.summary}` : "",
    "",
    "COLOR IDS:",
    colors.map((c) => `${c.id} (${c.label})`).join(", "),
    "",
    "CANDIDATE TRENDS:",
    ...groups.map((g) =>
      [
        `- key ${g.key} | avg growth ${pct(g.growth)} | ${g.items.length} items`,
        ...g.items.map((r) => `    id ${r.item.id}: ${r.item.title ?? "untitled"} · ${r.item.category ?? "?"} · ${r.item.price ?? "?"} ${r.item.currency ?? ""} · stores ${r.item.metrics.store_count ?? "?"}`),
      ].join("\n"),
    ),
  ].join("\n");
  return { system, prompt };
}

// ---------- cleaning ----------

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function cleanDigest(raw: RawDigest, groups: CandidateGroup[], colors: ColorEntry[]): { headline: string; elements: DigestElement[] } {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const colorIds = new Map<string, string>();
  for (const c of colors) {
    colorIds.set(slug(c.id), c.id);
    colorIds.set(slug(c.label), c.id);
  }
  const used = new Set<string>();
  const elements: DigestElement[] = [];
  for (const e of raw.elements ?? []) {
    const g = byKey.get(e.key) ?? groups.find((x) => slug(x.value) === slug(e.key) || slug(x.value) === slug(e.name));
    if (!g || used.has(g.key)) continue;
    const allowed = new Map(g.items.map((r) => [r.item.id, r.item]));
    const picked: TrendItem[] = [];
    for (const id of e.example_ids ?? []) {
      const it = allowed.get(Number(id));
      if (it && !picked.includes(it)) picked.push(it);
    }
    for (const r of g.items) if (picked.length < 3 && !picked.includes(r.item)) picked.push(r.item); // top up from the group
    if (picked.length < 3) continue;
    let color = e.color ? (colorIds.get(slug(e.color)) ?? null) : null;
    if (!color && g.attr === "colors") color = g.value;
    used.add(g.key);
    elements.push({
      key: g.key,
      name: e.name?.trim() || g.value,
      color,
      reason: e.reason?.trim() ?? "",
      fits_because: e.fits_because?.trim() ?? "",
      examples: picked.slice(0, 5),
    });
    if (elements.length === 4) break;
  }
  return { headline: raw.headline?.trim() || "This week's trends for your brand", elements };
}

// ---------- core ----------

export async function buildDigestFrom(opts: {
  profile: BrandProfile;
  weights: Weights;
  items: TrendItem[];
  feedback?: Feedback[];
  colors: ColorEntry[];
  ask: AskDigest;
  rank?: RankFn;
  today?: string;
}): Promise<DigestSpec> {
  const { profile, weights, items, feedback = [], colors, ask } = opts;
  // A 👎 on a whole trend element (item_key without ":<itemId>") keeps that trend out of future digests.
  const disliked = new Set(feedback.filter((f) => f.vote === -1 && !f.item_key.includes(":")).map((f) => f.item_key));
  const ranked = (opts.rank ?? baselineRank)(items, { profile, weights, feedback });
  const groups = groupCandidates(ranked, { dislikedKeys: disliked });
  if (groups.length < 2) throw new Error("Not enough matching trend data for a digest yet (need at least 2 trends with 3+ pictured products each)");

  const { system, prompt } = digestPrompt(profile, groups, colors);
  const validate = (v: RawDigest) => {
    const n = cleanDigest(v, groups, colors).elements.length;
    return n >= 2 ? [] : [`only ${n} usable trend elements after checking ids`];
  };
  const cleaned = cleanDigest(await ask({ system, prompt, schema: digestPlanSchema, validate }), groups, colors);

  const spec: DigestSpec = {
    version: 1,
    brand_id: profile.brand_id,
    date: opts.today ?? new Date().toISOString().slice(0, 10),
    headline: cleaned.headline,
    elements: cleaned.elements,
  };
  const problems = checkDigest(spec, { colors: new Set(colors.map((c) => c.id)) });
  if (problems.length) throw new Error(`Digest failed checks: ${problems.join("; ")}`);
  return spec;
}
