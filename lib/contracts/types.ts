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
}

// ---------- brands ----------

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
  | "segment_compare"; // the same metric across two segments

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
  answerQuestion(brandId: string, question: string): AsyncIterable<DashboardEvent>;
  buildDigest(brandId: string): Promise<DigestSpec>;
}

/** Data + delivery (owner Yizhi), called by the engine and the scheduler. */
export interface Plumbing {
  crawlBrand(brandId: string): Promise<void>;
  runConnectors(): Promise<void>;
  sendDigest(brandId: string, digest: DigestSpec, channel: "email" | "slack" | "whatsapp"): Promise<void>;
}
