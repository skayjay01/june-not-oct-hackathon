import "server-only";
import { db } from "@/lib/db/server";
import { engine } from "@/lib/engine";
import { refreshStaleConnections } from "@/lib/sources/licensed";
import { sendDigest, type Channel } from "./send-digest";

// The scheduler (US-004, FR-5): builds and sends digests for brands that are due.
// Meant to be called once a day (Vercel cron → /api/cron/digests). Daily brands are due after
// 20 hours, weekly brands after 6.5 days, so a slightly late or early run still sends once.

const DUE_AFTER_H = { daily: 20, weekly: 156 } as const;
const MAX_PER_RUN = 20; // each digest is an AI call; keep one run inside the function's time limit

export type ScheduleResult = { brand: string; sent: boolean; note: string };

export async function sendDueDigests(now = new Date()): Promise<ScheduleResult[]> {
  const { data: brands, error } = await db()
    .from("brands")
    .select("id, name, digest_channel, digest_frequency, brand_profiles!inner(brand_id)")
    .order("created_at");
  if (error) throw error;

  const results: ScheduleResult[] = [];
  for (const b of brands) {
    if (results.filter((r) => r.sent).length >= MAX_PER_RUN) break;
    const { data: last } = await db()
      .from("digests")
      .select("sent_at")
      .eq("brand_id", b.id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hours = last?.sent_at ? (now.getTime() - new Date(last.sent_at).getTime()) / 3_600_000 : Infinity;
    if (hours < DUE_AFTER_H[b.digest_frequency as keyof typeof DUE_AFTER_H]) continue;
    try {
      await refreshStaleConnections(b.id); // the brand's own API-key sources, e.g. Perplexity
      const digest = await engine.buildDigest(b.id);
      await sendDigest(b.id, digest, b.digest_channel as Channel);
      results.push({ brand: b.name, sent: true, note: `sent by ${b.digest_channel}` });
    } catch (e) {
      results.push({ brand: b.name, sent: false, note: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
