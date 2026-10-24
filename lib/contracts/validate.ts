// Checks the schemas can't express: counts, the fixed vocabularies, and weights totaling 100.
// Each returns a list of problems; an empty list means valid.

import { CHART_TYPES, QUERY_NAMES } from "./schemas";
import { WEIGHT_DIMENSIONS, type BrandProfile, type DashboardSpec, type DigestSpec, type Weights } from "./types";

/** Allowed ids from data/curation; pass what you loaded. Omit a set to skip that check. */
export interface Vocab {
  colors?: Set<string>;
  styleTags?: Set<string>;
  categories?: Set<string>;
}

const notIn = (field: string, ids: string[], allowed?: Set<string>) =>
  allowed ? ids.filter((id) => !allowed.has(id)).map((id) => `${field}: unknown id "${id}"`) : [];

export function checkDashboard(spec: DashboardSpec): string[] {
  const errs: string[] = [];
  if (!spec.title?.trim()) errs.push("title is empty");
  if (!spec.notice && spec.widgets.length === 0) errs.push("no widgets and no notice");
  if (spec.widgets.length > 6) errs.push(`too many widgets (${spec.widgets.length}, max 6)`);
  const ids = new Set<string>();
  for (const w of spec.widgets) {
    if (ids.has(w.id)) errs.push(`duplicate widget id "${w.id}"`);
    ids.add(w.id);
    if (!(CHART_TYPES as readonly string[]).includes(w.chart)) errs.push(`widget ${w.id}: unknown chart "${w.chart}"`);
    if (!(QUERY_NAMES as readonly string[]).includes(w.query)) errs.push(`widget ${w.id}: unknown query "${w.query}"`);
    if (w.chart === "color_swatches" && w.params.attribute !== "colors") errs.push(`widget ${w.id}: color_swatches needs attribute "colors"`);
  }
  return errs;
}

export function checkDigest(d: DigestSpec, vocab: Vocab = {}): string[] {
  const errs: string[] = [];
  if (d.elements.length < 2 || d.elements.length > 4) errs.push(`needs 2–4 elements, has ${d.elements.length}`);
  const keys = new Set<string>();
  for (const e of d.elements) {
    if (keys.has(e.key)) errs.push(`duplicate element key "${e.key}"`);
    keys.add(e.key);
    if (e.examples.length < 3 || e.examples.length > 5) errs.push(`element ${e.key}: needs 3–5 examples, has ${e.examples.length}`);
    if (e.color) errs.push(...notIn(`element ${e.key} color`, [e.color], vocab.colors));
  }
  return errs;
}

export function checkProfile(p: Pick<BrandProfile, "style_tags" | "colors" | "categories">, vocab: Vocab = {}): string[] {
  const errs: string[] = [];
  if (p.style_tags.length < 3 || p.style_tags.length > 5) errs.push(`needs 3–5 style tags, has ${p.style_tags.length}`);
  errs.push(...notIn("style_tags", p.style_tags, vocab.styleTags));
  errs.push(...notIn("colors", p.colors, vocab.colors));
  errs.push(...notIn("categories", p.categories, vocab.categories));
  return errs;
}

export function checkWeights(w: Weights): string[] {
  const errs: string[] = [];
  let total = 0;
  for (const k of WEIGHT_DIMENSIONS) {
    const v = w[k];
    if (!Number.isInteger(v) || v < 0 || v > 100) errs.push(`${k} must be a whole number 0–100`);
    total += v;
  }
  if (total !== 100) errs.push(`weights total ${total}, must be 100`);
  return errs;
}
