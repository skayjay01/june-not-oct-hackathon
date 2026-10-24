"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db/server";
import { runConnectors, type ConnectorResult } from "@/lib/sources/run-connectors";

export type RunState = { results: ConnectorResult[]; message: string };

// Shopify rate-limits per visitor across all its shops; don't let repeated clicks hammer the stores.
const MIN_GAP_MIN = 10;

export async function runNow(): Promise<RunState> {
  const { data } = await db().from("sources").select("last_run_at").eq("key", "shopify_products").maybeSingle();
  const last = data?.last_run_at ? new Date(data.last_run_at).getTime() : 0;
  const waitMin = Math.ceil(MIN_GAP_MIN - (Date.now() - last) / 60_000);
  if (waitMin > 0) {
    return { results: [], message: `The last run was under ${MIN_GAP_MIN} minutes ago. Try again in ${waitMin} min, so the stores aren't overloaded.` };
  }
  const results = await runConnectors();
  refresh();
  return { results, message: "Done." };
}

export async function setEnabled(key: string, enabled: boolean) {
  const { error } = await db().from("sources").update({ enabled }).eq("key", key);
  if (error) throw error;
  refresh();
}
