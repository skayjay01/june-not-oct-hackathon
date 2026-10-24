// Sample data so every workstream can build before the real thing works.
// Clearly fake: brand "Demo Brand", example.com links, placehold.co images.

import type { BrandProfile, DashboardSpec, DigestSpec, TrendItem, Weights } from "./types";

export const DEMO_BRAND_ID = "00000000-0000-4000-8000-000000000001";

const img = (label: string) => `https://placehold.co/400x500?text=${encodeURIComponent(label)}`;

export const sampleTrendItems: TrendItem[] = [
  {
    id: 1, source: "shopify_products", source_item_id: "demo-1", brand_id: null, type: "product",
    title: "Butter yellow linen midi dress", category: "dresses",
    attributes: { colors: ["butter-yellow"], silhouette: "a-line", material: "linen", style_tags: ["minimalist"] },
    price: 48, currency: "USD", image_url: img("Linen midi"), link: "https://example.com/p/1",
    metrics: { growth: 0.42, store_count: 9 }, published_at: "2026-10-02T00:00:00Z", collected_at: "2026-10-24T00:00:00Z",
  },
  {
    id: 2, source: "shopify_products", source_item_id: "demo-2", brand_id: null, type: "product",
    title: "Cloud Dancer poplin shirt dress", category: "dresses",
    attributes: { colors: ["cloud-dancer"], silhouette: "column", material: "poplin", style_tags: ["quiet-luxury"] },
    price: 39, currency: "USD", image_url: img("Shirt dress"), link: "https://example.com/p/2",
    metrics: { growth: 0.31, store_count: 14 }, published_at: "2026-10-08T00:00:00Z", collected_at: "2026-10-24T00:00:00Z",
  },
  {
    id: 3, source: "shopify_products", source_item_id: "demo-3", brand_id: null, type: "product",
    title: "Cherry red slip dress", category: "dresses",
    attributes: { colors: ["cherry-red"], silhouette: "column", material: "satin", style_tags: ["office-siren"] },
    price: 45, currency: "USD", image_url: img("Slip dress"), link: "https://example.com/p/3",
    metrics: { growth: 0.18, store_count: 6 }, published_at: "2026-09-28T00:00:00Z", collected_at: "2026-10-24T00:00:00Z",
  },
  ...([
    [5, "Butter yellow knit tank", "tops", "butter-yellow", "rib-knit", 28],
    [6, "Butter yellow poplin shirt", "shirts", "butter-yellow", "poplin", 42],
    [7, "Cloud Dancer linen trousers", "trousers", "cloud-dancer", "linen", 55],
    [8, "Cloud Dancer cashmere crew", "knitwear", "cloud-dancer", "cashmere", 89],
  ] as const).map(([id, title, category, color, material, price]): TrendItem => ({
    id, source: "shopify_products", source_item_id: `demo-${id}`, brand_id: null, type: "product",
    title, category, attributes: { colors: [color], material, style_tags: ["minimalist"] },
    price, currency: "USD", image_url: img(title), link: `https://example.com/p/${id}`,
    metrics: { growth: 0.2, store_count: 5 }, published_at: "2026-10-10T00:00:00Z", collected_at: "2026-10-24T00:00:00Z",
  })),
  {
    id: 4, source: "google_trends", source_item_id: "kw-butter-yellow-dress", brand_id: null, type: "keyword",
    title: "butter yellow dress", category: "dresses", attributes: { colors: ["butter-yellow"] },
    price: null, currency: null, image_url: null, link: null,
    metrics: { search_interest: 78, growth: 0.55 }, published_at: null, collected_at: "2026-10-24T00:00:00Z",
  },
];

const pick = (...ids: number[]) => ids.map((id) => sampleTrendItems.find((i) => i.id === id)!);

export const sampleBrandProfile: BrandProfile = {
  brand_id: DEMO_BRAND_ID,
  style_tags: ["minimalist", "quiet-luxury", "scandi"],
  price_min: 30, price_max: 90, currency: "USD",
  categories: ["dresses", "tops", "knitwear"],
  colors: ["cloud-dancer", "oatmeal", "butter-yellow"],
  summary: "Demo Brand sells clean, logo-free essentials in soft neutrals, priced for everyday wear. Its copy leans on words like 'effortless', 'capsule' and 'linen'.",
  edited_fields: [],
  updated_at: "2026-10-24T00:00:00Z",
};

export const sampleWeights: Weights = {
  brand_id: DEMO_BRAND_ID, preset: "price-sensitive",
  price_fit: 30, social_buzz: 20, growth_speed: 25, competitor_adoption: 10, style_fit: 15,
};

export const sampleDashboard: DashboardSpec = {
  version: 1,
  question: "Which colors are gaining traction in summer dresses under $50?",
  title: "Rising colors in dresses under $50",
  summary: "Butter yellow is the fastest-rising dress color in tracked stores, up 42% over the last 90 days, with searches up 55%. Cloud Dancer is carried by the most stores. Cherry red is growing more slowly.",
  widgets: [
    {
      id: "w1", chart: "color_swatches", query: "attribute_growth", params: { attribute: "colors", categories: ["dresses"], price_max: 50 },
      title: "Fastest-rising dress colors", caption: "Growth in new listings over 90 days", unit: "percent",
      source: "Store product lists", date_range: { from: "2026-07-26", to: "2026-10-24" },
      rows: [
        { label: "Butter yellow", value: 42, hex: "#F3E3A1", item_ids: [1] },
        { label: "Cloud Dancer", value: 31, hex: "#F0EEE9", item_ids: [2] },
        { label: "Cherry red", value: 18, hex: "#B3172B", item_ids: [3] },
      ],
    },
    {
      id: "w2", chart: "trend_line", query: "interest_over_time", params: { keywords: ["butter yellow dress"] },
      title: "Searches for “butter yellow dress”", caption: "Google search interest, 0–100", unit: "index",
      source: "Google Trends", date_range: { from: "2026-07-26", to: "2026-10-24" },
      rows: [
        { label: "butter yellow dress", value: 41, date: "2026-08-01" },
        { label: "butter yellow dress", value: 52, date: "2026-09-01" },
        { label: "butter yellow dress", value: 78, date: "2026-10-01" },
      ],
    },
    {
      id: "w3", chart: "image_grid", query: "top_examples", params: { categories: ["dresses"], price_max: 50, limit: 3 },
      title: "Examples on shelves now", caption: "Real products matching the trend", source: "Store product lists",
      rows: sampleTrendItems.filter((i) => i.type === "product").slice(0, 3).map((i) => ({ label: i.title ?? "", value: i.price ?? 0, image_url: i.image_url ?? undefined, link: i.link ?? undefined, item_ids: [i.id] })),
    },
  ],
};

export const sampleDigest: DigestSpec = {
  version: 1,
  brand_id: DEMO_BRAND_ID,
  date: "2026-10-24",
  headline: "Soft yellows and crisp whites are rising in your price range",
  elements: [
    {
      key: "butter-yellow", name: "Butter yellow", color: "butter-yellow",
      reason: "New butter-yellow dresses are up 42% in tracked stores and searches are up 55%.",
      fits_because: "It is a soft, wearable shade that sits well with your neutral palette.",
      examples: pick(1, 5, 6),
    },
    {
      key: "cloud-dancer", name: "Cloud Dancer", color: "cloud-dancer",
      reason: "Pantone's 2026 Color of the Year is now carried by 14 tracked stores.",
      fits_because: "A clean off-white matches your minimalist, logo-free look.",
      examples: pick(2, 7, 8),
    },
  ],
};
