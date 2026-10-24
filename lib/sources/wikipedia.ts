import type { TrendAttributes } from "@/lib/contracts";
import { politeFetch } from "./crawler";
import { summarize } from "./google-trends";
import type { TrendRow } from "./store-products";

// Connector "wikipedia_pageviews": weekly English Wikipedia readership of fashion articles, an open
// attention signal much like search interest. Wikimedia's pageview API is free, needs no key and is
// public-domain data (https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews). Articles are
// mapped by hand to Blair's vocabulary ids, because matching names automatically picks wrong pages
// ("Burgundy" is a region). Each article was checked to exist with real traffic on 2026-10-24.

type Article = { title: string; term: string; category?: string; attributes: TrendAttributes };

const ARTICLES: Article[] = [
  { title: "Quiet luxury", term: "quiet luxury", attributes: { style_tags: ["quiet-luxury"] } },
  { title: "Ballet and fashion", term: "balletcore", attributes: { style_tags: ["ballet-core"] } },
  { title: "Coquette aesthetic", term: "coquette", attributes: { style_tags: ["coquette"] } },
  { title: "Boho-chic", term: "boho", attributes: { style_tags: ["boho"] } },
  { title: "Cottagecore", term: "cottagecore", attributes: { style_tags: ["cottagecore"] } },
  { title: "Y2K aesthetic", term: "y2k", attributes: { style_tags: ["y2k"] } },
  { title: "Indie sleaze", term: "indie sleaze", attributes: { style_tags: ["indie-sleaze"] } },
  { title: "Grunge fashion", term: "grunge", attributes: { style_tags: ["grunge"] } },
  { title: "Streetwear", term: "streetwear", attributes: { style_tags: ["streetwear"] } },
  { title: "Gorpcore", term: "gorpcore", attributes: { style_tags: ["gorpcore"] } },
  { title: "Athleisure", term: "athleisure", attributes: { style_tags: ["athleisure"] } },
  { title: "Workwear", term: "workwear", attributes: { style_tags: ["workwear"] } },
  { title: "Western wear", term: "western wear", attributes: { style_tags: ["western"] } },
  { title: "Preppy", term: "preppy", attributes: { style_tags: ["preppy"] } },
  { title: "Vintage clothing", term: "vintage clothing", attributes: { style_tags: ["vintage"] } },
  { title: "Sustainable fashion", term: "sustainable fashion", attributes: { style_tags: ["sustainable"] } },
  { title: "Modest fashion", term: "modest fashion", attributes: { style_tags: ["modest"] } },
  { title: "Clean girl aesthetic", term: "clean girl", attributes: { style_tags: ["clean-girl"] } },
  { title: "Office siren", term: "office siren", attributes: { style_tags: ["office-siren"] } },
  { title: "Maximalism", term: "maximalist", attributes: { style_tags: ["maximalist"] } },
  { title: "Slip dress", term: "slip dress", category: "dresses", attributes: {} },
  { title: "Pencil skirt", term: "pencil skirt", category: "skirts", attributes: { silhouette: "fitted" } },
  { title: "Jelly shoes", term: "jelly shoes", category: "flats", attributes: {} },
  { title: "Ballet flat", term: "ballet flat", category: "flats", attributes: {} },
  { title: "Mary Jane (shoe)", term: "mary jane shoes", category: "flats", attributes: {} },
  { title: "Trench coat", term: "trench coat", category: "coats", attributes: {} },
  { title: "Tartan", term: "tartan", attributes: { pattern: "plaid" } },
  { title: "Argyle (pattern)", term: "argyle", attributes: { pattern: "geometric" } },
  { title: "Animal print", term: "animal print", attributes: { pattern: "animal" } },
  { title: "Polka dot", term: "polka dot", attributes: { pattern: "polka-dot" } },
  { title: "Gingham", term: "gingham", attributes: { pattern: "gingham" } },
  { title: "Paisley (design)", term: "paisley", attributes: { pattern: "paisley" } },
  { title: "Floral design", term: "floral print", attributes: { pattern: "floral" } },
  { title: "Bouclé", term: "boucle", attributes: { material: "tweed" } },
  { title: "Tweed (cloth)", term: "tweed", attributes: { material: "tweed" } },
  { title: "Fake fur", term: "faux fur", attributes: { material: "faux-fur" } },
  { title: "Sequin", term: "sequin", attributes: { material: "sequin" } },
  { title: "Satin", term: "satin", attributes: { material: "satin" } },
  { title: "Lace", term: "lace", attributes: { material: "lace" } },
  { title: "Cashmere wool", term: "cashmere", attributes: { material: "cashmere" } },
  { title: "Corduroy", term: "corduroy", attributes: { material: "corduroy" } },
  { title: "Crochet", term: "crochet", attributes: { material: "crochet" } },
  { title: "Velvet", term: "velvet", attributes: { material: "velvet" } },
  { title: "Suede", term: "suede", attributes: { material: "suede" } },
  { title: "Linen", term: "linen", attributes: { material: "linen" } },
  { title: "Denim", term: "denim", attributes: { material: "denim" } },
  { title: "International Klein Blue", term: "klein blue", attributes: { colors: ["klein-blue"] } },
  { title: "Burgundy (color)", term: "burgundy", attributes: { colors: ["burgundy"] } },
  { title: "Chocolate (color)", term: "chocolate brown", attributes: { colors: ["chocolate"] } },
  { title: "Cloud Dancer", term: "cloud dancer", attributes: { colors: ["cloud-dancer"] } },
  { title: "Sage (color)", term: "sage green", attributes: { colors: ["sage"] } },
  { title: "Cobalt blue", term: "cobalt blue", attributes: { colors: ["cobalt"] } },
  { title: "Lavender (color)", term: "lavender", attributes: { colors: ["lavender"] } },
  { title: "Plum (color)", term: "plum", attributes: { colors: ["plum"] } },
  { title: "Navy blue", term: "navy blue", attributes: { colors: ["navy"] } },
];

const WEEKS = 26;
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Daily views → weekly totals (oldest first, full weeks only), scaled so the busiest week is 100 like Google Trends. */
export function weeklyIndex(daily: { timestamp: string; views: number }[]): { date: string; value: number }[] {
  const weeks: { date: string; value: number }[] = [];
  const full = daily.slice(daily.length % 7);
  for (let i = 0; i < full.length; i += 7) {
    const t = full[i].timestamp;
    weeks.push({ date: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`, value: full.slice(i, i + 7).reduce((s, d) => s + d.views, 0) });
  }
  const max = Math.max(...weeks.map((w) => w.value), 0);
  return max > 0 ? weeks.map((w) => ({ date: w.date, value: Math.round((w.value / max) * 100) })) : [];
}

export async function collectWikipedia(now = new Date()): Promise<{ rows: TrendRow[]; missing: string[] }> {
  // yesterday is the last complete day; WEEKS full weeks back from there
  const end = new Date(now.getTime() - DAY);
  const start = new Date(end.getTime() - (WEEKS * 7 - 1) * DAY);
  const rows: TrendRow[] = [];
  const missing: string[] = [];
  for (const a of ARTICLES) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(a.title.replace(/ /g, "_"))}/daily/${ymd(start)}/${ymd(end)}`;
    const res = await politeFetch(url);
    const items = res.ok ? (JSON.parse(res.body) as { items?: { timestamp: string; views: number }[] }).items : undefined;
    const series = weeklyIndex(items ?? []);
    if (series.length < 12) {
      missing.push(a.title);
      continue;
    }
    rows.push({
      source: "wikipedia_pageviews",
      source_item_id: a.title,
      brand_id: null,
      type: "keyword",
      title: `${a.term} (Wikipedia readers)`,
      category: a.category ?? null,
      attributes: a.attributes,
      price: null,
      currency: null,
      image_url: null,
      link: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, "_"))}`,
      metrics: { ...summarize(series), series },
      published_at: null,
      collected_at: now.toISOString(),
    });
  }
  return { rows, missing };
}
