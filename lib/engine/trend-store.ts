// Loads the candidate pool the matcher ranks: public trend items plus this brand's
// own licensed items (FR-8), within the time window. Server only — pass the
// secret-key Supabase client (lib/db/server.ts from B0).

import type { QuestionIntent, TrendItem } from "../contracts/types";

/** Max rows pulled per request; the matcher ranks in memory. */
export const CANDIDATE_LIMIT = 2000;

/** The slice of the supabase-js query builder used here (keeps this file free of the dependency). */
interface Query extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(columns: string): Query;
  or(filter: string): Query;
  gte(column: string, value: string): Query;
  order(column: string, opts: { ascending: boolean }): Query;
  limit(n: number): Query;
}
export interface TrendDb {
  from(table: "trend_items"): Query;
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

  const q = db.from("trend_items").select("*").or(`brand_id.is.null,brand_id.eq.${brandId}`).gte("collected_at", since);
  // no category filter here: rows with no category (e.g. keywords) must reach the matcher, which filters
  const { data, error } = await q.order("collected_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  if (error) throw new Error(`loadCandidates: ${error.message}`);

  // numeric columns arrive as strings from PostgREST; normalize to the contract
  return (data ?? []).map((r) => {
    const row = r as TrendItem & { price: number | string | null };
    return { ...row, price: row.price === null ? null : Number(row.price), attributes: row.attributes ?? {}, metrics: row.metrics ?? {} };
  });
}
