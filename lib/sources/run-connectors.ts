import "server-only";
import { db } from "@/lib/db/server";
import { collectAnnouncedColors } from "./announced-colors";
import { collectGoogleTrends } from "./google-trends";
import { recordRun, sourceEnabled } from "./registry";
import { collectMuseum, MUSEUMS } from "./museums";
import { collectStoreProducts, type TrendRow } from "./store-products";
import { collectWikipedia } from "./wikipedia";

// Contract function (tasks/build-plan.md): runConnectors() refreshes the Trend library.
// Each connector runs only if its `sources` row is enabled (FR-7). Re-runs upsert on
// (source, source_item_id, brand_id), so nothing is duplicated (US-003). Connectors run in
// parallel (each talks to different hosts) so a full run fits in one request.

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
  {
    key: "wikipedia_pageviews",
    collect: async () => {
      const { rows, missing } = await collectWikipedia();
      return { rows, note: `${rows.length} articles${missing.length ? `; no data for ${missing.join(", ")}` : ""}` };
    },
  },
  ...MUSEUMS.map((m) => ({
    key: m.key,
    collect: async () => {
      const { rows, failed } = await collectMuseum(m);
      return { rows, note: `${rows.length} objects${failed.length ? `; failed searches: ${failed.join(", ")}` : ""}` };
    },
  })),
];

async function upsert(rows: TrendRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from("trend_items")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,source_item_id,brand_id" });
    if (error) throw new Error(`saving trend items: ${error.message}`);
  }
}

async function runOne(c: (typeof CONNECTORS)[number]): Promise<ConnectorResult> {
  if (!(await sourceEnabled(c.key))) return { key: c.key, ran: false, rows: 0, note: "switched off" };
  try {
    const { rows, note } = await c.collect();
    await upsert(rows);
    await recordRun(c.key, rows.length ? undefined : note);
    return { key: c.key, ran: true, rows: rows.length, note };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordRun(c.key, msg);
    return { key: c.key, ran: true, rows: 0, note: `failed: ${msg}` };
  }
}

export async function runConnectors(only?: string[]): Promise<ConnectorResult[]> {
  return Promise.all(CONNECTORS.filter((c) => !only || only.includes(c.key)).map(runOne));
}
