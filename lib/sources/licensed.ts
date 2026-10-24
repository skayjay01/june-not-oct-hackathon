import "server-only";
import { db } from "@/lib/db/server";
import { loadTaggerVocab, parseCsv } from "./curation";
import type { TrendRow } from "./store-products";
import { makeTagger } from "./tagger";

// Bring your own licence (D3, US-008, FR-8): a brand uploads an export from its own subscription.
// Rows are stored with that brand's id, so only that brand ever sees them; disconnecting deletes them.

export const LICENSED_SOURCES = [
  { key: "byol_wgsn", name: "WGSN", api: "WGSN Intelligence API (enterprise contract)" },
  { key: "byol_coloro", name: "Coloro", api: null },
  { key: "byol_pantone", name: "Pantone", api: "Pantone Connect API (licence)" },
  { key: "byol_premiere_vision", name: "Première Vision", api: null },
  { key: "byol_ftrend", name: "F-Trend", api: null },
  { key: "byol_heuritech", name: "Heuritech", api: "Heuritech API (enterprise contract)" },
] as const;

export type LicensedKey = (typeof LICENSED_SOURCES)[number]["key"];

const MAX_ROWS = 5000;

const col = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const hit = Object.keys(r).find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === n);
    if (hit && r[hit]) return r[hit];
  }
  return "";
};

/**
 * Imports a CSV export. Recognized columns (any case): title/name, category, color/colour, material,
 * pattern, price, currency, link/url, image/image_url, date/published, growth (0.35 or 35%), interest.
 * Category and colors are mapped to Blair's vocabulary the same way as store products.
 */
export async function importLicensedCsv(brandId: string, key: LicensedKey, csv: string): Promise<{ rows: number; skipped: number }> {
  const source = LICENSED_SOURCES.find((s) => s.key === key);
  if (!source) throw new Error("Unknown source");
  const records = parseCsv(csv).slice(0, MAX_ROWS);
  if (!records.length) throw new Error("The file has no rows. It needs a header row, then one row per item.");

  const tag = makeTagger(await loadTaggerVocab());
  const now = new Date().toISOString();
  let skipped = 0;
  const rows: TrendRow[] = [];
  records.forEach((r, i) => {
    const title = col(r, "title", "name", "trend", "item");
    if (!title) {
      skipped++;
      return;
    }
    const t = tag({ title, productType: col(r, "category", "type"), colorValues: [col(r, "color", "colour", "colorname")].filter(Boolean), description: [col(r, "material"), col(r, "pattern"), col(r, "description")].join(" ") });
    const price = Number(col(r, "price").replace(/[^0-9.]/g, ""));
    const growthRaw = col(r, "growth", "change");
    const growth = growthRaw ? Number(growthRaw.replace("%", "")) / (growthRaw.includes("%") ? 100 : 1) : NaN;
    const interest = Number(col(r, "interest", "searchinterest", "score"));
    const date = col(r, "date", "published", "publishedat", "season");
    const isProduct = Number.isFinite(price) && price > 0;
    rows.push({
      source: key,
      source_item_id: col(r, "id", "sku") || `${i}:${title}`.slice(0, 200),
      brand_id: brandId,
      type: isProduct ? "product" : t.colors.length && !t.category ? "color" : "keyword",
      title,
      category: t.category,
      attributes: {
        colors: t.colors,
        ...(t.material ? { material: t.material } : {}),
        ...(t.pattern ? { pattern: t.pattern } : {}),
        ...(t.silhouette ? { silhouette: t.silhouette } : {}),
      },
      price: isProduct ? price : null,
      currency: col(r, "currency") || (isProduct ? "USD" : null),
      image_url: col(r, "image", "imageurl", "img") || null,
      link: col(r, "link", "url") || null,
      metrics: {
        ...(Number.isFinite(growth) ? { growth: Math.max(-1, Math.min(3, growth)) } : {}),
        ...(Number.isFinite(interest) && interest > 0 ? { search_interest: Math.min(100, interest) } : {}),
      },
      published_at: /^\d{4}-\d{2}-\d{2}/.test(date) ? new Date(date).toISOString() : null,
      collected_at: now,
    });
  });

  // The sources row (licensed = true) is created the first time any brand connects it.
  const { error: srcError } = await db()
    .from("sources")
    .upsert({ key, name: `${source.name} (your licence)`, licensed: true, enabled: true, terms_notes: "Bring your own licence: uploaded by the brand from its own subscription; visible to that brand only (FR-8)" }, { onConflict: "key", ignoreDuplicates: true });
  if (srcError) throw srcError;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("trend_items").upsert(rows.slice(i, i + 500), { onConflict: "source,source_item_id,brand_id" });
    if (error) throw error;
  }
  return { rows: rows.length, skipped };
}

export async function disconnectLicensed(brandId: string, key: LicensedKey) {
  const { error } = await db().from("trend_items").delete().eq("brand_id", brandId).eq("source", key);
  if (error) throw error;
}

export async function licensedCounts(brandId: string): Promise<Record<string, number>> {
  const counts = await Promise.all(
    LICENSED_SOURCES.map(async (s) => {
      const { count } = await db().from("trend_items").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("source", s.key);
      return [s.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}
