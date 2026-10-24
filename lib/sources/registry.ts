import "server-only";
import { db } from "@/lib/db/server";

// Each connector is a row in the `sources` table (FR-7): switch it off there and it stops running,
// with no code change. A missing row counts as off.

export async function sourceEnabled(key: string): Promise<boolean> {
  const { data, error } = await db().from("sources").select("enabled").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.enabled ?? false;
}

export async function recordRun(key: string, error?: string) {
  await db()
    .from("sources")
    .update({ last_run_at: new Date().toISOString(), last_error: error ?? null })
    .eq("key", key);
}
