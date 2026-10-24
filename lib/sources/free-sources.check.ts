// Live check for the free trend sources: runs every museum and the Wikipedia connector against the
// real APIs (no database) and prints what each returned. Needs internet; takes ~2 minutes.
// Run: npx tsx lib/sources/free-sources.check.ts  (exits 1 if a source returns nothing)

import { collectMuseum, MUSEUMS } from "./museums";
import { collectWikipedia, weeklyIndex } from "./wikipedia";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad++;
};

// weekly totals: partial oldest week dropped, busiest week = 100
const daily = Array.from({ length: 15 }, (_, i) => ({ timestamp: `202610${String(i + 1).padStart(2, "0")}00`, views: i < 8 ? 10 : 20 }));
const w = weeklyIndex(daily);
expect("weeklyIndex: two full weeks, scaled", w.length === 2 && w[0].date === "2026-10-02" && w[1].value === 100 && w[0].value === 50, JSON.stringify(w));

const main = async () => {
  const results = await Promise.all([
    collectWikipedia().then(({ rows, missing }) => ({ key: "wikipedia_pageviews", rows, problems: missing })),
    ...MUSEUMS.map((m) => collectMuseum(m).then(({ rows, failed }) => ({ key: m.key, rows, problems: failed }))),
  ]);
  for (const r of results) {
    expect(`${r.key}: returns rows`, r.rows.length > 0, `${r.rows.length} rows${r.problems.length ? `; problems: ${r.problems.join(", ")}` : ""}`);
    for (const row of r.rows.slice(0, 2)) console.log(`       ${row.type} · ${row.title} · ${row.category ?? "-"} · ${JSON.stringify(row.attributes)} · ${row.image_url ?? row.link}`);
  }
  const wiki = results[0].rows;
  expect("wikipedia: every row has a 0–100 series", wiki.every((r) => (r.metrics.series?.length ?? 0) >= 12 && Math.max(...r.metrics.series!.map((p) => p.value)) === 100));
  process.exit(bad ? 1 : 0);
};
main();
