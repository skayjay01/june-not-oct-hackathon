// A4 — Matcher: ranks Trend library items for one brand and runs the predefined
// dashboard queries (FR-13, FR-15). Pure and synchronous: no AI and no database here,
// so changing weights re-ranks instantly (US-007). Loading candidates is trend-store.ts.

import { WEIGHT_DIMENSIONS, type BrandProfile, type Feedback, type QueryName, type QueryParams, type QuestionIntent, type TrendItem, type WeightDimension, type Weights, type WidgetRow } from "../contracts/types";

/** How much a dimension the question stresses (QuestionIntent.emphasis) gains before renormalizing. */
const EMPHASIS_BOOST = 15;
/** Max share a single 👍/👎 (or attribute affinity) moves an item's score. */
const VOTE_WEIGHT = 0.15;
const AFFINITY_WEIGHT = 0.1;

export interface Vote {
  item: TrendItem;
  vote: 1 | -1;
}

/** What ranking needs. A BrandProfile and Weights row can be passed as-is. */
export interface RankContext {
  profile: Pick<BrandProfile, "style_tags" | "colors" | "categories" | "price_min" | "price_max"> | null;
  weights: Pick<Weights, WeightDimension>;
  intent?: QuestionIntent | null;
  /** feedback already resolved to the items it was about */
  votes?: Vote[];
  /** raw feedback rows; example-level keys (`${element}:${itemId}`) are resolved against the items being ranked */
  feedback?: Pick<Feedback, "item_key" | "vote">[];
}

/** What filtering and the predefined queries need on top of ranking. */
export interface MatchContext extends RankContext {
  brandId: string;
  /** for the time window; defaults to now */
  now?: Date;
}

export type DimensionScores = Record<WeightDimension, number>;

export interface RankedItem {
  item: TrendItem;
  /** 0–1 after weights and feedback */
  score: number;
  dims: DimensionScores;
}

// ---------- weights ----------

/** The brand's weights, nudged toward what the question stressed; always totals 100. */
export function effectiveWeights(weights: MatchContext["weights"], emphasis: WeightDimension[] = []): DimensionScores {
  const raw = Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, Math.max(0, weights[d]) + (emphasis.includes(d) ? EMPHASIS_BOOST : 0)])) as DimensionScores;
  const total = WEIGHT_DIMENSIONS.reduce((s, d) => s + raw[d], 0) || 1;
  return Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, (raw[d] * 100) / total])) as DimensionScores;
}

// ---------- filtering ----------

/** Hard filters: own-brand licensed data only (FR-8), time window, and the question's category and price. */
export function filterItems(items: TrendItem[], ctx: MatchContext, params: QueryParams = {}): TrendItem[] {
  const intent = ctx.intent;
  const categories = params.categories ?? intent?.categories ?? [];
  const priceMin = params.price_min ?? intent?.price_min ?? null;
  const priceMax = params.price_max ?? intent?.price_max ?? null;
  const windowDays = params.time_window_days ?? intent?.time_window_days ?? 90;
  const since = (ctx.now ?? new Date()).getTime() - windowDays * 86_400_000;

  return items.filter((i) => {
    if (i.brand_id !== null && i.brand_id !== ctx.brandId) return false;
    if (new Date(i.published_at ?? i.collected_at).getTime() < since) return false;
    if (categories.length && i.category && !categories.includes(i.category)) return false;
    if (i.price !== null && priceMin !== null && i.price < priceMin) return false;
    if (i.price !== null && priceMax !== null && i.price > priceMax) return false;
    return true;
  });
}

// ---------- scoring ----------

/** Ranks items best first. Signals are compared within this candidate set, so scores are relative. */
export function rankItems(items: TrendItem[], ctx: RankContext): RankedItem[] {
  const w = effectiveWeights(ctx.weights, ctx.intent?.emphasis);
  const growth = percentiles(items, (i) => i.metrics.growth);
  const interest = percentiles(items, (i) => i.metrics.search_interest);
  const stores = percentiles(items, (i) => i.metrics.store_count);
  const prefs = preferences(ctx);
  const votes = [...(ctx.votes ?? []), ...resolveFeedback(ctx.feedback ?? [], items)];
  const affinity = attributeAffinity(votes);
  const itemVotes = new Map(votes.map((v) => [v.item.id, v.vote]));

  return items
    .map((item) => {
      const dims: DimensionScores = {
        price_fit: priceFit(item.price, prefs.priceMin, prefs.priceMax),
        social_buzz: interest.get(item.id) ?? 0,
        growth_speed: growth.get(item.id) ?? 0,
        competitor_adoption: stores.get(item.id) ?? 0,
        style_fit: styleFit(item, prefs),
      };
      let score = WEIGHT_DIMENSIONS.reduce((s, d) => s + (w[d] / 100) * dims[d], 0);
      score *= 1 + VOTE_WEIGHT * (itemVotes.get(item.id) ?? 0) + AFFINITY_WEIGHT * Math.tanh(affinityOf(item, affinity));
      return { item, score: clamp01(score), dims };
    })
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id);
}

interface Prefs {
  styleTags: Set<string>;
  colors: Set<string>;
  categories: Set<string>;
  priceMin: number | null;
  priceMax: number | null;
}

/** What "fits" means for this request: the question's own choices first, then the brand profile. */
function preferences({ profile, intent }: RankContext): Prefs {
  return {
    styleTags: new Set([...(intent?.style_tags ?? []), ...(profile?.style_tags ?? [])]),
    colors: new Set(profile?.colors ?? []),
    categories: new Set(intent?.categories.length ? intent.categories : (profile?.categories ?? [])),
    priceMin: intent?.price_min ?? profile?.price_min ?? null,
    priceMax: intent?.price_max ?? profile?.price_max ?? null,
  };
}

/** 1 inside the range, falling to 0 at twice the distance of the range's own width; 0.5 when unknown. */
function priceFit(price: number | null, min: number | null, max: number | null): number {
  if (price === null || (min === null && max === null)) return 0.5;
  const lo = min ?? 0;
  const hi = max ?? Infinity;
  if (price >= lo && price <= hi) return 1;
  const span = Number.isFinite(hi) ? Math.max(hi - lo, hi * 0.25, 1) : Math.max(lo, 1);
  const off = price < lo ? lo - price : price - hi;
  return clamp01(1 - off / (2 * span));
}

/** Share of the item's style tags, colors and category that match what the brand or question wants. */
function styleFit(item: TrendItem, p: Prefs): number {
  if (!p.styleTags.size && !p.colors.size && !p.categories.size) return 0.5;
  const share = (vals: string[] | undefined, want: Set<string>) => {
    if (!want.size || !vals?.length) return null;
    return vals.filter((v) => want.has(v)).length / vals.length;
  };
  const parts: [number | null, number][] = [
    [share(item.attributes.style_tags, p.styleTags), 0.5],
    [share(item.attributes.colors, p.colors), 0.3],
    [p.categories.size && item.category ? (p.categories.has(item.category) ? 1 : 0) : null, 0.2],
  ];
  const known = parts.filter((x): x is [number, number] => x[0] !== null);
  if (!known.length) return 0.25; // item says nothing about style: below average, not zero
  return known.reduce((s, [v, wt]) => s + v * wt, 0) / known.reduce((s, [, wt]) => s + wt, 0);
}

/** Each item's rank of a metric among items that have it, 0–1 (ties share a rank). Missing → absent. */
function percentiles(items: TrendItem[], get: (i: TrendItem) => number | undefined): Map<number, number> {
  const withVal = items.filter((i) => typeof get(i) === "number" && Number.isFinite(get(i)));
  const sorted = withVal.map((i) => get(i)!).sort((a, b) => a - b);
  const out = new Map<number, number>();
  for (const i of withVal) {
    const v = get(i)!;
    const below = sorted.findIndex((x) => x >= v);
    const atOrBelow = sorted.length - [...sorted].reverse().findIndex((x) => x <= v);
    out.set(i.id, sorted.length === 1 ? 1 : (below + atOrBelow - 1) / 2 / (sorted.length - 1));
  }
  return out;
}

/** Net votes per attribute value ("color:butter-yellow", "style:y2k", "category:dresses"). */
function attributeAffinity(votes: Vote[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { item, vote } of votes) for (const k of attributeKeys(item)) out.set(k, (out.get(k) ?? 0) + vote);
  return out;
}

function affinityOf(item: TrendItem, affinity: Map<string, number>): number {
  const keys = attributeKeys(item);
  return keys.length ? keys.reduce((s, k) => s + (affinity.get(k) ?? 0), 0) / keys.length : 0;
}

function attributeKeys(i: TrendItem): string[] {
  return [
    ...(i.attributes.colors ?? []).map((c) => `color:${c}`),
    ...(i.attributes.style_tags ?? []).map((t) => `style:${t}`),
    ...(i.attributes.silhouette ? [`silhouette:${i.attributes.silhouette}`] : []),
    ...(i.attributes.material ? [`material:${i.attributes.material}`] : []),
    ...(i.attributes.pattern ? [`pattern:${i.attributes.pattern}`] : []),
    ...(i.category ? [`category:${i.category}`] : []),
  ];
}

function resolveFeedback(rows: Pick<Feedback, "item_key" | "vote">[], items: TrendItem[]): Vote[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return rows.flatMap((f) => {
    const item = byId.get(itemIdFromFeedbackKey(f.item_key) ?? NaN);
    return item ? [{ item, vote: f.vote }] : [];
  });
}

/** Feedback.item_key is `${element.key}:${item.id}` for one example; returns that id, else null. */
export function itemIdFromFeedbackKey(key: string): number | null {
  const m = key.match(/:(\d+)$/);
  return m ? Number(m[1]) : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ---------- predefined queries (FR-13) ----------

export interface QueryResult {
  rows: WidgetRow[];
  /** distinct sources behind the rows, for the widget footer (FR-14) */
  sources: string[];
  date_range: { from: string; to: string } | null;
  unit: "percent" | "count" | "index" | "usd";
}

export interface QueryOptions {
  /** color id → hex, from data/curation/colors.json, for color swatches */
  colorHex?: Record<string, string>;
  /** id → display label (colors, style tags, categories, attributes); ids shown as-is when missing */
  labels?: Record<string, string>;
}

const DEFAULT_LIMIT = 8;

/** Runs one predefined query over the brand's candidate items. Never free-form. */
export function runQuery(name: QueryName, params: QueryParams, items: TrendItem[], ctx: MatchContext, opts: QueryOptions = {}): QueryResult {
  const pool = filterItems(items, ctx, params);
  const limit = Math.max(1, Math.min(24, Math.round(params.limit ?? DEFAULT_LIMIT)));
  const label = (id: string) => opts.labels?.[id] ?? id;
  const done = (rows: WidgetRow[], used: TrendItem[], unit: QueryResult["unit"]): QueryResult => ({ rows, ...provenance(used), unit });

  switch (name) {
    case "top_examples": {
      const ranked = rankItems(pool.filter((i) => i.type === "product" && matchesKeywords(i, params.keywords) && matchesStyle(i, params.style_tags)), ctx).slice(0, limit);
      return done(
        ranked.map(({ item, score }) => ({ label: item.title ?? "Untitled", value: Math.round(score * 100), image_url: item.image_url ?? undefined, link: item.link ?? undefined, item_ids: [item.id] })),
        ranked.map((r) => r.item),
        "index",
      );
    }

    case "attribute_growth": {
      const attr = params.attribute ?? "colors";
      const ranked = rankItems(pool.filter((i) => matchesStyle(i, params.style_tags)), ctx);
      const groups = new Map<string, RankedItem[]>();
      for (const r of ranked) for (const v of attributeValues(r.item, attr)) groups.set(v, [...(groups.get(v) ?? []), r]);
      // a value's score: mean of its best three items, so one strong item can't carry a thin group alone
      const scored = [...groups].map(([value, rs]) => {
        const top = rs.slice(0, 3);
        return { value, rs, score: top.reduce((s, r) => s + r.score, 0) / 3 };
      });
      scored.sort((a, b) => b.score - a.score || a.value.localeCompare(b.value));
      const shown = scored.slice(0, limit);
      return done(
        shown.map(({ value, rs, score }) => ({ label: label(value), value: Math.round(score * 100), hex: attr === "colors" ? opts.colorHex?.[value] : undefined, item_ids: rs.slice(0, 5).map((r) => r.item.id) })),
        shown.flatMap((s) => s.rs.map((r) => r.item)),
        "index",
      );
    }

    case "interest_over_time": {
      const kws = pool.filter((i) => i.type === "keyword" && matchesKeywords(i, params.keywords));
      const rows = kws.flatMap((i): WidgetRow[] => {
        const series = i.metrics.series?.length ? i.metrics.series : typeof i.metrics.search_interest === "number" ? [{ date: i.collected_at.slice(0, 10), value: i.metrics.search_interest }] : [];
        return series.map((p) => ({ label: i.title ?? i.source_item_id, value: p.value, date: p.date, item_ids: [i.id] }));
      });
      rows.sort((a, b) => a.label.localeCompare(b.label) || (a.date ?? "").localeCompare(b.date ?? ""));
      const keep = new Set([...new Set(rows.map((r) => r.label))].slice(0, limit));
      const shown = rows.filter((r) => keep.has(r.label));
      const dates = shown.map((r) => r.date!).sort();
      // the chart's own dates, not when the rows were collected
      return { ...done(shown, kws, "index"), date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null };
    }

    case "item_count": {
      const matching = pool.filter((i) => i.type === "product" && matchesKeywords(i, params.keywords) && matchesStyle(i, params.style_tags));
      const stores = new Set(matching.map(storeOf).filter(Boolean));
      return done(
        [
          { label: "Matching products", value: matching.length, item_ids: matching.slice(0, 50).map((i) => i.id) },
          { label: "Stores carrying them", value: stores.size },
        ],
        matching,
        "count",
      );
    }

    case "segment_compare": {
      const segs = params.segments ?? [];
      const used: TrendItem[] = [];
      const rows = segs.map((seg) => {
        const members = pool.filter((i) => i.type === "product" && inSegment(i, seg));
        used.push(...members);
        const g = members.map((i) => i.metrics.growth).filter((x): x is number => typeof x === "number");
        const avg = g.length ? g.reduce((s, x) => s + x, 0) / g.length : 0;
        return { label: label(seg), value: Math.round(avg * 100), item_ids: rankItems(members, ctx).slice(0, 5).map((r) => r.item.id) };
      });
      return done(rows, used, "percent");
    }
  }
}

function attributeValues(i: TrendItem, attr: NonNullable<QueryParams["attribute"]>): string[] {
  const v = i.attributes[attr];
  if (attr === "colors" && i.type === "color" && !v?.length) return []; // color items must name a listed color (FR-4)
  return Array.isArray(v) ? v : v ? [v] : [];
}

function matchesKeywords(i: TrendItem, keywords?: string[]): boolean {
  if (!keywords?.length) return true;
  const text = `${i.title ?? ""} ${i.source_item_id}`.toLowerCase();
  return keywords.some((k) => text.includes(k.toLowerCase()));
}

function matchesStyle(i: TrendItem, tags?: string[]): boolean {
  return !tags?.length || (i.attributes.style_tags ?? []).some((t) => tags.includes(t));
}

/** A segment is any vocabulary id: category, style tag, color, silhouette, material or pattern. */
function inSegment(i: TrendItem, seg: string): boolean {
  const a = i.attributes;
  return i.category === seg || !!a.style_tags?.includes(seg) || !!a.colors?.includes(seg) || a.silhouette === seg || a.material === seg || a.pattern === seg;
}

function storeOf(i: TrendItem): string | null {
  try {
    return i.link ? new URL(i.link).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function provenance(items: TrendItem[]): Pick<QueryResult, "sources" | "date_range"> {
  const dates = items.map((i) => (i.published_at ?? i.collected_at).slice(0, 10)).sort();
  return {
    sources: [...new Set(items.map((i) => i.source))].sort(),
    date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };
}
