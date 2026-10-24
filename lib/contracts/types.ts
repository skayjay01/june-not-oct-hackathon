// Shared shapes every workstream codes to (tasks/build-plan.md, "Shared contracts").
// Owner: Yishan (Workstream A). Change by PR and tell the other owners.
//
// Data shapes use snake_case so they map 1:1 to the Supabase tables in
// supabase/migrations (Workstream B). Vocabulary ids (style tags, colors,
// categories, attributes) come from data/curation/*.json (Workstream C).

// ---------- vocabulary ids (values live in data/curation) ----------

/** id from data/curation/style-tags.json, e.g. "quiet-luxury" */
export type StyleTagId = string;
/** id from data/curation/colors.json, e.g. "cloud-dancer" */
export type ColorId = string;
/** id from data/curation/categories.json, e.g. "dresses" */
export type CategoryId = string;

// ---------- trend library ----------

export type TrendItemType = "product" | "keyword" | "color" | "fabric" | "pattern";

export interface TrendAttributes {
  colors?: ColorId[];
  silhouette?: string; // id from attributes.json "silhouettes"
  material?: string; // id from attributes.json "materials"
  pattern?: string; // id from attributes.json "patterns"
  style_tags?: StyleTagId[];
}

export interface TrendMetrics {
  /** 0–100 relative interest (e.g. Google Trends) */
  search_interest?: number;
  /** growth vs. the previous period, as a fraction: 0.35 = +35% */
  growth?: number;
  /** number of tracked stores carrying it */
  store_count?: number;
  /** dated points for trend lines, e.g. weekly Google Trends interest; oldest first */
  series?: { date: string; value: number }[];
  /** how much the houses behind this signal count (data/curation/brand-weights.json); 1 = neutral, up to 3 */
  house_weight?: number;
  /** 0–1: how far the trend has spread to other brands (data/curation/trickle-down.csv) */
  adoption?: number;
}

/** One row of `trend_items`. brand_id null = public data; set = that brand's licensed data only (FR-8). */
export interface TrendItem {
  id: number;
  source: string; // sources.key, e.g. "shopify_products"
  source_item_id: string;
  brand_id: string | null;
  type: TrendItemType;
  title: string | null;
  category: CategoryId | null;
  attributes: TrendAttributes;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  link: string | null;
  metrics: TrendMetrics;
  published_at: string | null; // ISO timestamp
  collected_at: string; // ISO timestamp
  /** set on editorial signals (source "editorial", negative id): where the fact comes from */
  evidence?: { source_name: string; brands: string[]; reliability: string; period: string; kind: string };
}

// ---------- brands ----------

export const SOCIAL_PLATFORMS = ["instagram", "tiktok", "pinterest", "facebook", "x", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Where a fact came from: the brand's own site (trusted), a web search (to confirm), or the founder. */
export type FoundSource = "site" | "search" | "you";

/** What onboarding found about a brand from its name alone, before asking the founder anything. */
export interface BrandPresence {
  /** the name as the brand writes it */
  name: string;
  /** null = not found, so onboarding must ask */
  website: string | null;
  website_source: FoundSource | null;
  /** we opened the homepage and it is this brand's */
  website_checked: boolean;
  /** the site turned away our reader (big retailers often do), so its pages may not crawl */
  website_blocked: boolean;
  socials: Partial<Record<SocialPlatform, { url: string; handle: string; source: FoundSource }>>;
  /** one line on who the brand is, so the founder can tell we found the right one */
  description: string | null;
  /** other brands with a similar name, for "Not you?" */
  alternatives: { name: string; website: string }[];
}

/** One row of `brand_profiles` (US-002). */
export interface BrandProfile {
  brand_id: string;
  style_tags: StyleTagId[]; // 3–5
  price_min: number | null;
  price_max: number | null;
  currency: string;
  categories: CategoryId[];
  colors: ColorId[];
  summary: string | null;
  /** fields the user edited; a re-crawl must not overwrite them */
  edited_fields: (keyof Omit<BrandProfile, "brand_id" | "edited_fields" | "updated_at">)[];
  updated_at: string;
}

export const WEIGHT_DIMENSIONS = ["price_fit", "social_buzz", "growth_speed", "competitor_adoption", "style_fit"] as const;
export type WeightDimension = (typeof WEIGHT_DIMENSIONS)[number];

/** One row of `weights`; the five dimensions always total 100 (FR-15). */
export type Weights = { brand_id: string; preset: string | null } & Record<WeightDimension, number>;

// ---------- question reader (A3) ----------

/** What the question reader extracts from a free-text question. */
export interface QuestionIntent {
  in_scope: boolean;
  /** set when in_scope is false: an answerable question to suggest instead (FR-14) */
  suggestion: string | null;
  style_tags: StyleTagId[];
  categories: CategoryId[];
  /** colors the question names; a family word ("green") means that family's ids */
  colors?: ColorId[];
  /** the question's subject words, as they'd appear in product titles or trend reports ("cap", "tartan") */
  keywords?: string[];
  price_min: number | null;
  price_max: number | null;
  /** which aspect the user is asking about */
  focus: "color" | "silhouette" | "material" | "pattern" | "product" | "keyword" | "general";
  /** dimensions the user stressed, used to nudge the brand's weights */
  emphasis: WeightDimension[];
  time_window_days: number; // default 90
}

// ---------- dashboards (A5 → B5) ----------

/** The fixed widget set (FR-12). The front end renders only these. */
export type ChartType = "trend_line" | "ranked_bar" | "image_grid" | "big_number" | "comparison" | "color_swatches";

/** Predefined, parameterized queries the AI may choose (FR-13). Never free-form SQL. */
export type QueryName =
  | "attribute_growth" // rank attribute values (colors, silhouettes…) by growth
  | "interest_over_time" // search interest for keywords over the window
  | "top_examples" // best-matching real items for the intent
  | "item_count" // how many matching items / stores
  | "segment_compare" // the same metric across two segments
  | "editorial_signals"; // runway, Lyst and press facts behind the trend, weighted by house

export interface QueryParams {
  attribute?: "colors" | "silhouette" | "material" | "pattern" | "style_tags";
  categories?: CategoryId[];
  style_tags?: StyleTagId[];
  price_min?: number;
  price_max?: number;
  keywords?: string[];
  segments?: [string, string];
  time_window_days?: number;
  limit?: number;
}

/** One data row inside a widget. `item_ids` link to the evidence panel (US-009). */
export interface WidgetRow {
  label: string;
  value: number;
  /** ISO date, for trend_line points */
  date?: string;
  /** color hex, for color_swatches */
  hex?: string;
  image_url?: string;
  link?: string;
  item_ids?: number[];
}

export interface Widget {
  id: string;
  chart: ChartType;
  query: QueryName;
  params: QueryParams;
  title: string;
  caption: string; // one line: what this shows
  /** filled by the backend after running the query (FR-7, FR-14) */
  source?: string;
  date_range?: { from: string; to: string };
  rows?: WidgetRow[];
  unit?: "percent" | "count" | "index" | "usd";
}

export interface DashboardSpec {
  version: 1;
  question: string;
  title: string;
  summary: string; // 2–3 sentences, grounded in the rows only
  widgets: Widget[];
  /** set when the question was out of scope or matched no data */
  notice?: { kind: "out_of_scope" | "no_data"; message: string; suggestion: string | null };
  /** how the question was read; lets the dashboard be re-ranked or followed up without the AI */
  intent?: QuestionIntent;
  /** set on a follow-up: the question it refined (US-009) */
  follows?: string;
}

/** Streamed by answerQuestion so widgets appear one by one. */
export type DashboardEvent =
  | { type: "plan"; title: string; widget_ids: string[] }
  | { type: "widget"; widget: Widget }
  | { type: "summary"; summary: string }
  | { type: "done"; spec: DashboardSpec; cached: boolean }
  | { type: "error"; message: string };

// ---------- digests (A6 → B7) ----------

export interface DigestElement {
  /** stable key used by feedback.item_key */
  key: string;
  name: string; // e.g. "Butter yellow" or "Barrel-leg denim"
  color: ColorId | null; // only from colors.json (FR-4)
  reason: string; // one sentence: why it's trending
  fits_because: string; // one sentence: why it fits this brand
  examples: TrendItem[]; // 3–5 real items (FR-3)
}

export interface DigestSpec {
  version: 1;
  /** digests.id once saved — sendDigest uses it to build 👍/👎 links (feedback.digest_id) */
  id?: string;
  brand_id: string;
  date: string; // ISO date
  headline: string;
  elements: DigestElement[]; // 2–4
}

// ---------- feedback ----------

/** One row of `feedback` (FR-6). */
export interface Feedback {
  brand_id: string;
  digest_id: string;
  item_key: string; // DigestElement.key, or `${element.key}:${item.id}` for one example
  vote: 1 | -1;
}

// ---------- function boundaries ----------

/** Engine (owner Yishan), called by the app (Yizhi). */
export interface Engine {
  buildProfile(brandId: string): Promise<BrandProfile>;
  /** pass `previous` to answer a follow-up that refines that dashboard (US-009) */
  answerQuestion(brandId: string, question: string, previous?: DashboardSpec): AsyncIterable<DashboardEvent>;
  buildDigest(brandId: string): Promise<DigestSpec>;
  /** re-rank a dashboard under new weights with no AI call (US-007) */
  rerankDashboard(brandId: string, spec: DashboardSpec, weights: Pick<Weights, WeightDimension>): Promise<DashboardSpec>;
  /** the real items behind a chart element, for the evidence panel (US-009); never another brand's licensed rows */
  getEvidence(brandId: string, itemIds: number[]): Promise<TrendItem[]>;
  /** onboarding: a brand's website and social accounts from its name (and its website, if the founder gave one) */
  findBrand(name: string, website?: string): Promise<BrandPresence>;
  /** when the brand's own site can't be read: save what public sources say about it as crawl text; returns pages saved */
  researchBrand(brandId: string): Promise<number>;
}

/** Data + delivery (owner Yizhi), called by the engine and the scheduler. */
export interface Plumbing {
  crawlBrand(brandId: string): Promise<void>;
  runConnectors(): Promise<void>;
  sendDigest(brandId: string, digest: DigestSpec, channel: "email" | "slack" | "whatsapp"): Promise<void>;
}
