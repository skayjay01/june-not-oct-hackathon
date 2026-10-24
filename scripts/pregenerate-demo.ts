// Builds the demo ahead of time (US-006): demo brands' profiles, weights and digests, and the
// rehearsed dashboards, then checks each rehearsed question replays from the cache in under 2 s.
//
// Run from the repo root (needs .env.local with the Supabase and AI settings):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/pregenerate-demo.ts
//   … --dry-run   lists what would be built, touching nothing
//   … --fresh     rebuilds the rehearsed dashboards instead of replaying stored ones
// Safe to re-run: brands are found by website, rows are upserted.

import { DEMO_BRANDS, DEMO_QUESTIONS } from "@/lib/engine/demo-plan";
import { pregenerate } from "@/lib/engine/pregenerate";

async function main() {
  if (process.argv.includes("--dry-run")) {
    for (const b of DEMO_BRANDS) console.log(`brand  ${b.name} (${b.crawlable ? "crawl " + b.website_url : "hand-entered profile"}), preset ${b.preset}`);
    for (const q of DEMO_QUESTIONS) console.log(`ask    "${q.question}" as ${q.brand}`);
    return;
  }
  const { serverPregenDeps } = await import("@/lib/engine/demo-server");
  const report = await pregenerate(DEMO_BRANDS, DEMO_QUESTIONS, serverPregenDeps((line) => console.log(line), { fresh: process.argv.includes("--fresh") }));
  const okQ = report.questions.filter((q) => q.ok).length;
  console.log(`\n${report.ok ? "DEMO READY" : "DEMO NOT READY"}: ${okQ}/${report.questions.length} rehearsed questions replay from cache in under 2 s.`);
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
