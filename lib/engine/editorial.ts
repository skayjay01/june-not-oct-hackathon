// Blair's editorial evidence as trend items (Workstream C hand-off, data/curation/README.md):
// - editorial-signals.csv: runway, Lyst and trend-data facts, each with a source link
// - brand-weights.json: how much a house's signal counts (Prada leads color/fabric/design,
//   Saint Laurent co-leads outerwear, Chanel and Miu Miu lead bags) → metrics.house_weight
// - trickle-down.csv: how far a trend has spread (luxury → mid-market → mass) → metrics.adoption
// Items get negative ids so they never collide with trend_items rows; they are public (brand_id null).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TrendItem, TrendItemType } from "../contracts/types";

export const EDITORIAL_SOURCE = "editorial";

export interface CurationFiles {
  signalsCsv: string;
  brandWeightsJson?: string;
  trickleCsv?: string;
  colorsJson: string;
  categoriesJson: string;
  attributesJson?: string;
  styleTagsJson?: string;
}

/** Reads the curation files from data/curation; null when the signals file isn't there. */
export function readCurationFiles(root = process.cwd()): CurationFiles | null {
  const dir = path.join(root, "data", "curation");
  const read = (f: string) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), "utf8") : undefined);
  const signalsCsv = read("editorial-signals.csv");
  const colorsJson = read("colors.json");
  const categoriesJson = read("categories.json");
  if (!signalsCsv || !colorsJson || !categoriesJson) return null;
  return {
    signalsCsv, colorsJson, categoriesJson,
    brandWeightsJson: read("brand-weights.json"), trickleCsv: read("trickle-down.csv"),
    attributesJson: read("attributes.json"), styleTagsJson: read("style-tags.json"),
  };
}

let cached: TrendItem[] | undefined;

/** Blair's signals as trend items, loaded once per server process. */
export function editorialItems(root = process.cwd()): TrendItem[] {
  if (cached) return cached;
  const files = readCurationFiles(root);
  cached = files ? buildEditorialItems(files) : [];
  return cached;
}

// ---------- pure core ----------

const TYPE: Record<string, TrendItemType> = { color: "color", material: "fabric", pattern: "pattern" };
/** editorial trend_type → brand-weights.json dimension */
const DIMENSION: Record<string, string> = { detail: "decoration", decoration: "decoration", color: "color", material: "material", pattern: "pattern", jacket: "jacket", bottoms: "bottoms", shoes: "shoes", bag: "bag" };
const DEFAULT_CATEGORY: Record<string, string> = { jacket: "jackets", bag: "bags" };
/** trickle-down stage → how widely other brands carry it (feeds competitor_adoption) */
const STAGE_ADOPTION: [RegExp, number][] = [[/reached mass/, 1], [/reached mid-market/, 0.7], [/in progress/, 0.5], [/watch/, 0.25]];

interface Signal {
  signal_id: string;
  trend: string;
  trend_type: string;
  color_code: string;
  signal_kind: string;
  value: string;
  unit: string;
  period: string;
  brands_cited: string;
  source_name: string;
  source_url: string;
  date_read: string;
  reliability: string;
}

export function buildEditorialItems(f: CurationFiles): TrendItem[] {
  const signals = parseCsv(f.signalsCsv) as unknown as Signal[];
  const colors = (JSON.parse(f.colorsJson).colors as { id: string; code?: string; family?: string }[]) ?? [];
  const categories = (JSON.parse(f.categoriesJson).categories as { id: string; label: string }[]) ?? [];
  const attrs = f.attributesJson ? (JSON.parse(f.attributesJson) as Record<string, { id: string; label?: string }[] | unknown>) : {};
  const styleTags = f.styleTagsJson ? (JSON.parse(f.styleTagsJson).tags as { id: string; label: string }[]) : [];
  const weights = houseWeights(f.brandWeightsJson);
  const adoption = trickleAdoption(f.trickleCsv);

  const byCode = new Map(colors.filter((c) => c.code).map((c) => [c.code!, c.id]));
  // family codes ("GR") name a whole family: use its shades from the list
  const familyOf = new Map(colors.filter((c) => c.code && c.family).map((c) => [c.code!.split("-")[0], c.family!]));
  const colorIds = (code: string): string[] => {
    if (!code) return [];
    if (byCode.has(code)) return [byCode.get(code)!];
    const family = familyOf.get(code);
    return family ? colors.filter((c) => c.family === family).map((c) => c.id).slice(0, 4) : [];
  };
  const list = (k: string) => (Array.isArray(attrs[k]) ? (attrs[k] as { id: string; label?: string }[]) : []);
  const firstIn = (text: string, entries: { id: string; label?: string }[]) => entries.find((e) => mentions(text, e.id.replace(/-/g, " ")) || (e.label && mentions(text, e.label)))?.id;

  return signals
    .filter((s) => s.signal_id && s.trend)
    .map((s, i): TrendItem => {
      const text = `${s.trend} ${s.trend_type}`;
      const cited = s.brands_cited ? s.brands_cited.split(";").map((b) => b.trim()).filter(Boolean) : [];
      const n = Number(s.value);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date_read) ? `${s.date_read}T00:00:00Z` : new Date(0).toISOString();
      return {
        id: -(i + 1),
        source: EDITORIAL_SOURCE,
        source_item_id: s.signal_id,
        brand_id: null,
        type: TYPE[s.trend_type] ?? "keyword",
        title: s.trend,
        category: categories.find((c) => mentions(text, c.id.replace(/-/g, " ")) || mentions(text, c.label))?.id ?? DEFAULT_CATEGORY[s.trend_type] ?? null,
        attributes: {
          ...(colorIds(s.color_code).length ? { colors: colorIds(s.color_code) } : {}),
          ...(firstIn(text, list("silhouettes")) ? { silhouette: firstIn(text, list("silhouettes")) } : {}),
          ...(firstIn(text, list("materials")) ? { material: firstIn(text, list("materials")) } : {}),
          ...(firstIn(text, list("patterns")) ? { pattern: firstIn(text, list("patterns")) } : {}),
          ...(styleTags.some((t) => mentions(text, t.label) || mentions(text, t.id.replace(/-/g, " "))) ? { style_tags: styleTags.filter((t) => mentions(text, t.label) || mentions(text, t.id.replace(/-/g, " "))).map((t) => t.id) } : {}),
        },
        price: null,
        currency: null,
        image_url: null,
        link: s.source_url || null,
        metrics: {
          house_weight: weightFor(s, cited, weights),
          ...(adoption.has(s.signal_id) ? { adoption: adoption.get(s.signal_id) } : {}),
          // year-on-year, market adoption and search/Lyst growth ("+4276%") all read as growth
          ...(Number.isFinite(n) && (/percent_(yoy|market_adoption)/.test(s.unit) || (s.unit === "percent" && /growth|search|lyst/.test(s.signal_kind))) ? { growth: n / 100 } : {}),
          ...(Number.isFinite(n) && /percent_key_influencers/.test(s.unit) ? { search_interest: Math.min(100, n) } : {}),
        },
        evidence: { source_name: s.source_name, brands: cited, reliability: s.reliability, period: s.period, kind: s.signal_kind },
        published_at: date,
        collected_at: date,
      };
    });
}

interface Weights {
  bySignal: Map<string, number>;
  byDimension: Record<string, Record<string, number>>;
  byBrand: Map<string, number>;
}

/** brand-weights.json → per-signal weights (from results[]), per-dimension house overrides, base brand weights. */
function houseWeights(json?: string): Weights {
  const out: Weights = { bySignal: new Map(), byDimension: {}, byBrand: new Map() };
  if (!json) return out;
  const w = JSON.parse(json);
  for (const b of w.brands ?? []) out.byBrand.set(b.brand, Number(b.weight) || 1);
  out.byDimension = w.dimension_overrides ?? {};
  for (const r of w.cross_check?.results ?? []) {
    const weight = Number(r.weight) || 1;
    for (const key of ["prada", "chanel", "miu_miu", "saint_laurent"]) {
      const id = r[key];
      if (typeof id === "string" && id) out.bySignal.set(id, Math.max(out.bySignal.get(id) ?? 1, weight));
    }
  }
  return out;
}

/** Blair's computed result weight when the signal is in a cross-check; else the cited houses' override for its dimension. */
function weightFor(s: Signal, cited: string[], w: Weights): number {
  if (w.bySignal.has(s.signal_id)) return w.bySignal.get(s.signal_id)!;
  const dim = w.byDimension[DIMENSION[s.trend_type] ?? ""] ?? {};
  return Math.max(1, ...cited.map((b) => dim[b] ?? w.byBrand.get(b) ?? 1));
}

function trickleAdoption(csv?: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!csv) return out;
  for (const row of parseCsv(csv)) {
    const level = STAGE_ADOPTION.find(([re]) => re.test(row.stage ?? ""))?.[1];
    if (level === undefined) continue;
    for (const id of (row.evidence_signal_ids ?? "").split(";").map((x) => x.trim()).filter(Boolean)) out.set(id, Math.max(out.get(id) ?? 0, level));
  }
  return out;
}

function mentions(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (p.length < 3) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}(s|es)?\\b`, "i").test(text);
}

/** Minimal RFC 4180 CSV → rows keyed by header (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
