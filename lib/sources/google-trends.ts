import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readCsv, readJson } from "./curation";
import type { TrendRow } from "./store-products";

// Connector "google_trends": search-interest curves for Blair's keywords.csv.
//
// Google answers automated requests to Trends with HTTP 429 (an anti-bot gate) and the
// official API is invite-only, so per PRD §7.3 we don't automate it. Instead, a person
// downloads each keyword's chart as CSV from trends.google.com (the download button on the
// "Interest over time" chart) into data/snapshots/google-trends/, and this connector
// imports those files. Several keywords in one file is fine, but values are only comparable
// within a file, so one keyword per file is preferred.

export const SNAPSHOT_DIR = path.join(process.cwd(), "data", "snapshots", "google-trends");

type Series = { keyword: string; region: string; points: { date: string; value: number }[] };

/** Parses a Google Trends "Interest over time" CSV export (Week/Day/Month/Time header rows). */
export function parseTrendsCsv(text: string): Series[] {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /^(Week|Day|Month|Time)\s*,/i.test(l.trim()));
  if (headerAt < 0) return [];
  const header = splitLine(lines[headerAt]).slice(1);
  const series: Series[] = header.map((h) => {
    const m = h.match(/^(.*?)(?::\s*\((.*)\))?$/);
    return { keyword: (m?.[1] ?? h).trim().toLowerCase(), region: m?.[2]?.trim() ?? "Worldwide", points: [] };
  });
  for (const line of lines.slice(headerAt + 1)) {
    const cells = splitLine(line);
    const date = cells[0]?.trim();
    if (!date || !/^\d{4}-\d{2}(-\d{2})?/.test(date)) continue;
    cells.slice(1).forEach((c, i) => {
      const v = c.trim() === "<1" ? 0.5 : Number(c);
      if (series[i] && Number.isFinite(v)) series[i].points.push({ date: date.slice(0, 10), value: v });
    });
  }
  return series.filter((s) => s.points.length);
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Recent interest (last 4 points) and growth vs. the 8 points before them. */
export function summarize(points: { value: number }[]) {
  const v = points.map((p) => p.value);
  const recent = mean(v.slice(-4));
  const before = mean(v.slice(-12, -4));
  return {
    search_interest: Math.round(recent),
    ...(before > 0 ? { growth: Math.max(-1, Math.min(3, Math.round((recent / before - 1) * 100) / 100)) } : {}),
  };
}

export async function collectGoogleTrends(now = new Date()): Promise<{ rows: TrendRow[]; files: number; unmatched: string[] }> {
  const files = (await readdir(SNAPSHOT_DIR).catch(() => [] as string[])).filter((f) => f.toLowerCase().endsWith(".csv"));
  const [keywords, colorList] = await Promise.all([
    readCsv("keywords.csv"),
    readJson<{ colors: { id: string; code?: string }[] }>("colors.json"),
  ]);
  // keywords.csv names colors by id ("butter-yellow") or by code ("GR-08"); family codes ("GR") stay untagged.
  const colorId = new Map(colorList.colors.flatMap((c) => [[c.id, c.id] as const, ...(c.code ? [[c.code, c.id] as const] : [])]));
  const byKeyword = new Map(keywords.map((k) => [k.keyword.toLowerCase(), k]));

  const rows: TrendRow[] = [];
  const unmatched: string[] = [];
  for (const f of files) {
    for (const s of parseTrendsCsv(await readFile(path.join(SNAPSHOT_DIR, f), "utf8"))) {
      const k = byKeyword.get(s.keyword);
      if (!k) unmatched.push(s.keyword);
      const maps = k?.maps_to_type ?? "";
      const id = k?.maps_to_id ?? "";
      rows.push({
        source: "google_trends",
        source_item_id: `${s.keyword}|${s.region}`,
        brand_id: null,
        type: "keyword",
        title: s.keyword,
        category: maps === "category" ? id : null,
        attributes: {
          ...(maps === "color" && colorId.has(id) ? { colors: [colorId.get(id)!] } : {}),
          ...(maps === "style_tag" && id ? { style_tags: [id] } : {}),
          ...(maps === "pattern" && id ? { pattern: id } : {}),
          ...(maps === "material" && id ? { material: id } : {}),
          ...(maps === "silhouette" && id ? { silhouette: id } : {}),
        },
        price: null,
        currency: null,
        image_url: null,
        link: `https://trends.google.com/trends/explore?q=${encodeURIComponent(s.keyword)}&geo=${s.region === "United States" ? "US" : ""}`,
        metrics: { ...summarize(s.points), series: s.points },
        published_at: null,
        collected_at: now.toISOString(),
      });
    }
  }
  return { rows, files: files.length, unmatched };
}
