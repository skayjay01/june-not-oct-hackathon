// Loads the candidate pool the matcher ranks: public trend items plus this brand's
// own licensed items (FR-8), within the time window. Server only — pass the
// secret-key Supabase client (lib/db/server.ts from B0).

import type { QuestionIntent, TrendItem } from "../contracts/types";

/** Max product rows pulled per request; the matcher ranks in memory. */
export const CANDIDATE_LIMIT = 2000;
/** Max non-product rows (keywords, colors, museum fabrics and patterns), read separately so they never crowd out products. */
export const SIGNAL_LIMIT = 1500;

/** The slice of the supabase-js query builder used here (keeps this file free of the dependency). */
interface Query extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  or(filter: string): Query;
  in(column: string, values: readonly (string | number)[]): Query;
  eq(column: string, value: string): Query;
  neq(column: string, value: string): Query;
  gte(column: string, value: string): Query;
  order(column: string, opts: { ascending: boolean }): Query;
  limit(n: number): Query;
}
export interface TrendDb {
  from(table: "trend_items"): { select(columns: string): Query };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadCandidates(
  db: TrendDb,
  brandId: string,
  scope: Pick<QuestionIntent, "time_window_days"> | null = null,
  now = new Date(),
): Promise<TrendItem[]> {
  // brandId goes into a PostgREST filter string, so it must be a plain uuid
  if (!UUID.test(brandId)) throw new Error("loadCandidates: brandId must be a uuid");
  const windowDays = scope?.time_window_days ?? 90;
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const base = () => db.from("trend_items").select("*").or(`brand_id.is.null,brand_id.eq.${brandId}`).gte("collected_at", since);
  // no category filter here: rows with no category (e.g. keywords) must reach the matcher, which filters
  const [products, signals] = await Promise.all([
    base().eq("type", "product").order("collected_at", { ascending: false }).limit(CANDIDATE_LIMIT),
    base().neq("type", "product").order("collected_at", { ascending: false }).limit(SIGNAL_LIMIT),
  ]);
  const error = products.error ?? signals.error;
  if (error) throw new Error(`loadCandidates: ${error.message}`);
  return [...(products.data ?? []), ...(signals.data ?? [])].map(toItem);
}

/** Max items one evidence-panel request may fetch. */
export const EVIDENCE_LIMIT = 100;

/**
 * The real records behind a chart element (US-009 evidence panel). Only public rows and this
 * brand's own licensed rows (FR-8), checked in the query and again here; unknown ids are skipped.
 */
export async function loadItemsByIds(db: TrendDb, brandId: string, ids: number[]): Promise<TrendItem[]> {
  if (!UUID.test(brandId)) throw new Error("loadItemsByIds: brandId must be a uuid");
  const wanted = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, EVIDENCE_LIMIT);
  if (!wanted.length) return [];
  const { data, error } = await db.from("trend_items").select("*").in("id", wanted).or(`brand_id.is.null,brand_id.eq.${brandId}`);
  if (error) throw new Error(`loadItemsByIds: ${error.message}`);
  const byId = new Map((data ?? []).map(toItem).filter((i) => i.brand_id === null || i.brand_id === brandId).map((i) => [i.id, i]));
  // keep the order the chart listed them in
  return wanted.map((id) => byId.get(id)).filter((i): i is TrendItem => !!i);
}

/** Numeric columns arrive as strings from PostgREST; normalize to the contract. */
function toItem(r: unknown): TrendItem {
  const row = r as TrendItem & { id: number | string; price: number | string | null };
  return { ...row, id: Number(row.id), price: row.price === null ? null : Number(row.price), attributes: row.attributes ?? {}, metrics: row.metrics ?? {} };
}
