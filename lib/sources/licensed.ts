import "server-only";
import { db } from "@/lib/db/server";
import { loadTaggerVocab, parseCsv } from "./curation";
import { checkPerplexityKey, PERPLEXITY_KEY, syncPerplexity } from "./perplexity";
import { seal, unseal } from "./secret-box";
import type { TrendRow } from "./store-products";
import { makeTagger } from "./tagger";

// Bring your own licence (D3, US-008, FR-8): a brand uploads an export from its own subscription, or
// connects a source with its own API key (connect: "api_key"; the key is saved encrypted).
// Rows are stored with that brand's id, so only that brand ever sees them; disconnecting deletes them.

export const LICENSED_SOURCES = [
  {
    key: PERPLEXITY_KEY,
    name: "Perplexity",
    connect: "api_key",
    api: null,
    keyHelp:
      "Paste an API key from perplexity.ai → Settings → API (it starts with pplx-). Each refresh is billed to your Perplexity API credit (a few cents); a Pro or Max chat plan alone doesn't include API use.",
  },
  { key: "byol_wgsn", name: "WGSN", connect: "upload", api: "WGSN Intelligence API (enterprise contract)", keyHelp: null },
  { key: "byol_coloro", name: "Coloro", connect: "upload", api: null, keyHelp: null },
  { key: "byol_pantone", name: "Pantone", connect: "upload", api: "Pantone Connect API (licence)", keyHelp: null },
  { key: "byol_premiere_vision", name: "Première Vision", connect: "upload", api: null, keyHelp: null },
  { key: "byol_ftrend", name: "F-Trend", connect: "upload", api: null, keyHelp: null },
  { key: "byol_heuritech", name: "Heuritech", connect: "upload", api: "Heuritech API (enterprise contract)", keyHelp: null },
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
  const { error: keyError } = await db().from("source_connections").delete().eq("brand_id", brandId).eq("source_key", key);
  if (keyError) throw keyError;
}

// ---------- API-key sources ----------

const KEY_CONNECTORS: Partial<Record<LicensedKey, { check: (apiKey: string) => Promise<void>; sync: (brandId: string, apiKey: string) => Promise<number> }>> = {
  [PERPLEXITY_KEY]: { check: checkPerplexityKey, sync: syncPerplexity },
};

export type Connection = { key_hint: string | null; last_synced_at: string | null; last_error: string | null };

async function runSync(brandId: string, key: LicensedKey, apiKey: string): Promise<number> {
  const connector = KEY_CONNECTORS[key];
  if (!connector) throw new Error("This source connects by file upload, not an API key.");
  const mark = (fields: Record<string, string | null>) => db().from("source_connections").update(fields).eq("brand_id", brandId).eq("source_key", key);
  try {
    const rows = await connector.sync(brandId, apiKey);
    await mark({ last_synced_at: new Date().toISOString(), last_error: null });
    return rows;
  } catch (e) {
    await mark({ last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    throw e;
  }
}

/** Checks the key with the provider, saves it encrypted, then pulls the first batch of items. */
export async function connectWithKey(brandId: string, key: LicensedKey, apiKey: string): Promise<number> {
  const connector = KEY_CONNECTORS[key];
  if (!connector) throw new Error("This source connects by file upload, not an API key.");
  await connector.check(apiKey);
  const { error } = await db()
    .from("source_connections")
    .upsert(
      { brand_id: brandId, source_key: key, secret_enc: seal(apiKey), key_hint: apiKey.slice(-4), connected_at: new Date().toISOString(), last_error: null },
      { onConflict: "brand_id,source_key" },
    );
  if (error) throw error;
  return runSync(brandId, key, apiKey);
}

/** Pulls fresh items with the saved key. */
export async function refreshWithKey(brandId: string, key: LicensedKey): Promise<number> {
  const { data, error } = await db().from("source_connections").select("secret_enc").eq("brand_id", brandId).eq("source_key", key).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Not connected.");
  return runSync(brandId, key, unseal(data.secret_enc));
}

/** Scheduler: refreshes key-connected sources not synced for `maxAgeH` hours. Failures are saved on the connection, not thrown. */
export async function refreshStaleConnections(brandId: string, maxAgeH = 20): Promise<void> {
  const { data } = await db().from("source_connections").select("source_key, last_synced_at").eq("brand_id", brandId);
  for (const c of data ?? []) {
    if (c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() < maxAgeH * 3_600_000) continue;
    await refreshWithKey(brandId, c.source_key as LicensedKey).catch(() => {});
  }
}

export async function connections(brandId: string): Promise<Record<string, Connection>> {
  const { data, error } = await db().from("source_connections").select("source_key, key_hint, last_synced_at, last_error").eq("brand_id", brandId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(({ source_key, ...c }) => [source_key, c]));
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
