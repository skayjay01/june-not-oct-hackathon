import "server-only";
import { db } from "@/lib/db/server";
import { collectAnnouncedColors } from "./announced-colors";
import { collectGoogleTrends } from "./google-trends";
import { recordRun, sourceEnabled } from "./registry";
import { collectStoreProducts, type TrendRow } from "./store-products";

// Contract function (tasks/build-plan.md): runConnectors() refreshes the Trend library.
// Each connector runs only if its `sources` row is enabled (FR-7). Re-runs upsert on
// (source, source_item_id, brand_id), so nothing is duplicated (US-003).

export type ConnectorResult = { key: string; ran: boolean; rows: number; note: string };

const CONNECTORS: { key: string; collect: () => Promise<{ rows: TrendRow[]; note: string }> }[] = [
  {
    key: "shopify_products",
    collect: async () => {
      const { rows, report } = await collectStoreProducts();
      const failed = report.filter((r) => r.error);
      return {
        rows,
        note: `${report.length - failed.length}/${report.length} stores read${failed.length ? `; skipped ${failed.map((r) => `${r.store} (${r.error})`).join(", ")}` : ""}`,
      };
    },
  },
  {
    key: "google_trends",
    collect: async () => {
      const { rows, files, unmatched } = await collectGoogleTrends();
      return {
        rows,
        note: files
          ? `${rows.length} keywords from ${files} snapshot files${unmatched.length ? `; not in keywords.csv: ${unmatched.join(", ")}` : ""}`
          : "no snapshot files yet (see data/snapshots/google-trends/README.md)",
      };
    },
  },
  {
    key: "announced_colors",
    collect: async () => {
      const rows = await collectAnnouncedColors();
      return { rows, note: `${rows.length} announced colors` };
    },
  },
];

async function upsert(rows: TrendRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from("trend_items")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,source_item_id,brand_id" });
    if (error) throw new Error(`saving trend items: ${error.message}`);
  }
}

export async function runConnectors(only?: string[]): Promise<ConnectorResult[]> {
  const results: ConnectorResult[] = [];
  for (const c of CONNECTORS) {
    if (only && !only.includes(c.key)) continue;
    if (!(await sourceEnabled(c.key))) {
      results.push({ key: c.key, ran: false, rows: 0, note: "switched off" });
      continue;
    }
    try {
      const { rows, note } = await c.collect();
      await upsert(rows);
      await recordRun(c.key, rows.length ? undefined : note);
      results.push({ key: c.key, ran: true, rows: rows.length, note });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordRun(c.key, msg);
      results.push({ key: c.key, ran: true, rows: 0, note: `failed: ${msg}` });
    }
  }
  return results;
}
