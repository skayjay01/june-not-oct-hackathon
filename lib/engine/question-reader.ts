// A3 — Question reader: free-text question → QuestionIntent (FR-11, FR-14).
// The AI reads the question against Blair's vocabulary; code then cleans the answer
// (unknown ids dropped, prices and time window made sane) so the matcher can trust it.
// If the AI call fails, a keyword reader answers instead so the user never sees an error.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FOCUS, questionIntentSchema } from "../contracts/schemas";
import { WEIGHT_DIMENSIONS, type BrandProfile, type QuestionIntent, type WeightDimension } from "../contracts/types";

export const MAX_QUESTION_CHARS = 500; // FR-11
export const DEFAULT_WINDOW_DAYS = 90;
const MIN_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 730;

/** One structured AI call. The A1 switchboard provides this; tests pass a fake. */
export type AskJson = (req: {
  step: string;
  system: string;
  prompt: string;
  schema: object;
  schemaName: string;
}) => Promise<unknown>;

export interface VocabEntry {
  id: string;
  label: string;
}

/** The ids the reader may return, with labels so users' wording can be mapped back to ids. */
export interface QuestionVocab {
  styleTags: VocabEntry[];
  categories: VocabEntry[];
  colors: VocabEntry[];
}

export interface ReadOptions {
  vocab: QuestionVocab;
  ask: AskJson;
  /** the asking brand's profile: used only to make the off-topic suggestion relevant */
  profile?: Pick<BrandProfile, "categories" | "style_tags" | "price_max"> | null;
  /** set for a follow-up (US-009): the question being refined and how it was read */
  previous?: { question: string; intent: QuestionIntent } | null;
}

export interface ReadResult {
  intent: QuestionIntent;
  /** "ai" normally; "keywords" when the AI call failed and the fallback answered */
  via: "ai" | "keywords";
}

/** Reads data/curation/{style-tags,categories,colors}.json; missing files give empty lists. */
export function loadQuestionVocab(root = process.cwd()): QuestionVocab {
  const load = (file: string, key: string): VocabEntry[] => {
    const path = join(root, "data", "curation", file);
    if (!existsSync(path)) return [];
    // colors.json calls the display text "name"; the other files call it "label"
    const rows = JSON.parse(readFileSync(path, "utf8"))[key] as { id: string; label?: string; name?: string }[];
    return rows.map((r) => ({ id: r.id, label: r.label ?? r.name ?? r.id }));
  };
  return {
    styleTags: load("style-tags.json", "tags"),
    categories: load("categories.json", "categories"),
    colors: load("colors.json", "colors"),
  };
}

export async function readQuestion(question: string, opts: ReadOptions): Promise<ReadResult> {
  const q = question.replace(/\s+/g, " ").trim();
  if (!q) return { intent: outOfScope(opts, "Ask a question about a fashion trend."), via: "keywords" };
  if (q.length > MAX_QUESTION_CHARS) {
    return { intent: outOfScope(opts, `Questions can be up to ${MAX_QUESTION_CHARS} characters. Try a shorter one.`), via: "keywords" };
  }
  try {
    const prev = opts.previous;
    const raw = await opts.ask({
      step: "interpret",
      system: systemPrompt(opts.vocab) + (prev ? FOLLOW_UP_RULE : ""),
      prompt: prev ? `Earlier question: ${prev.question}\nIts settings: ${JSON.stringify(prev.intent)}\nFollow-up: ${q}` : q,
      schema: questionIntentSchema,
      schemaName: "question_intent",
    });
    return { intent: normalizeIntent(raw, opts), via: "ai" };
  } catch {
    return { intent: opts.previous ? refineByKeywords(q, opts.previous.intent, opts) : readByKeywords(q, opts), via: "keywords" };
  }
}

const FOLLOW_UP_RULE = `

The user is refining an earlier question. Return the full settings for the earlier question as changed by the follow-up: keep every earlier setting the follow-up does not change. A follow-up like "only under $50" or "what about skirts?" is in scope whenever the earlier question was.`;

// ---------- prompt ----------

const list = (entries: VocabEntry[]) => entries.map((e) => `${e.id} (${e.label})`).join(", ") || "(none loaded)";

function systemPrompt(v: QuestionVocab): string {
  return `You read questions from small fashion brands for a trend dashboard and turn each into search settings.

The dashboard can answer questions about fashion trends: which colors, silhouettes, materials, patterns, products, styles or search terms are rising, peaking or popular, within a category, style or price range, compared across segments, or over a time window. Its data is public product listings from online stores, search interest, Pinterest trends, runway and editorial reports, publicly announced trend colors, and museum archives.

These are in scope: questions about an upcoming season ("spring 2027", "next fall"), because runway and early signals answer them; and questions asking whether the brand should act on a trend ("should we lean green or orange?", "should we do a team collab?", "is it worth adding prints?"), because the dashboard shows the evidence for that decision; and "how big is this trend or moment?", because search interest, product counts and growth measure a trend's size. Merch, caps, jerseys and brand or team collaborations are fashion products.

Set in_scope to false only when the question is not about fashion trends (weather, stocks, coding, general chat), or asks for something the dashboard cannot do: predicting sales, revenue or demand figures, a competitor's revenue or private numbers, designing or generating images, writing marketing copy, or legal, financial or business advice that is not about a trend. When in_scope is false, set suggestion to one short question the dashboard can answer that stays close to what the user wanted; otherwise set suggestion to null.

Use only these ids. Leave a list empty if the question names none.
style_tags: ${list(v.styleTags)}
categories: ${list(v.categories)}

price_min and price_max are in US dollars; null when the question gives no price. "under $50" means price_max 50.
focus is what the user asks about: color, silhouette, material, pattern, product, keyword (search terms), or general.
emphasis lists only the dimensions the user stresses: price_fit (affordability, price point), social_buzz (viral, Instagram, TikTok, Pinterest), growth_speed (fastest-rising, emerging, breakout), competitor_adoption (what other brands or stores carry), style_fit (fits my brand, on-brand). Usually empty.
time_window_days: the period asked about, in days; ${DEFAULT_WINDOW_DAYS} when not stated ("last month" 30, "this season" 90, "past 6 months" 180, "this year" 365).`;
}

// ---------- cleaning the AI's answer ----------

/** Makes any AI output a valid QuestionIntent: ids from the vocabulary only, sane numbers. */
export function normalizeIntent(raw: unknown, opts: Pick<ReadOptions, "vocab" | "profile">): QuestionIntent {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const { vocab } = opts;

  const inScope = r.in_scope !== false;
  const focus = (FOCUS as readonly string[]).includes(r.focus as string) ? (r.focus as QuestionIntent["focus"]) : "general";
  const emphasis = unique(asStrings(r.emphasis).filter((d): d is WeightDimension => (WEIGHT_DIMENSIONS as readonly string[]).includes(d)));

  let priceMin = asPrice(r.price_min);
  let priceMax = asPrice(r.price_max);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];

  if (!inScope) {
    const suggestion = typeof r.suggestion === "string" && r.suggestion.trim() ? r.suggestion.trim() : null;
    return outOfScope(opts, suggestion);
  }
  return {
    in_scope: true,
    suggestion: null,
    style_tags: toIds(asStrings(r.style_tags), vocab.styleTags),
    categories: toIds(asStrings(r.categories), vocab.categories),
    price_min: priceMin,
    price_max: priceMax,
    focus,
    emphasis,
    time_window_days: asWindow(r.time_window_days),
  };
}

/** Problems with an intent (empty list = valid); what the matcher may rely on. */
export function checkIntent(i: QuestionIntent, vocab: QuestionVocab): string[] {
  const errs: string[] = [];
  const known = (ids: string[], entries: VocabEntry[], field: string) =>
    ids.filter((id) => !entries.some((e) => e.id === id)).forEach((id) => errs.push(`${field}: unknown id "${id}"`));
  known(i.style_tags, vocab.styleTags, "style_tags");
  known(i.categories, vocab.categories, "categories");
  if (i.price_min !== null && i.price_max !== null && i.price_min > i.price_max) errs.push("price_min above price_max");
  if (i.time_window_days < MIN_WINDOW_DAYS || i.time_window_days > MAX_WINDOW_DAYS) errs.push("time_window_days out of range");
  if (i.in_scope === !!i.suggestion) errs.push(i.in_scope ? "in-scope intent has a suggestion" : "out-of-scope intent has no suggestion");
  return errs;
}

function outOfScope(opts: Pick<ReadOptions, "vocab" | "profile">, suggestion: string | null): QuestionIntent {
  return {
    in_scope: false,
    suggestion: suggestion ?? defaultSuggestion(opts),
    style_tags: [],
    categories: [],
    price_min: null,
    price_max: null,
    focus: "general",
    emphasis: [],
    time_window_days: DEFAULT_WINDOW_DAYS,
  };
}

/** A question the dashboard can always answer, pointed at the brand's own category when known. */
function defaultSuggestion({ vocab, profile }: Pick<ReadOptions, "vocab" | "profile">): string {
  const catId = profile?.categories[0];
  const cat = vocab.categories.find((c) => c.id === catId)?.label.toLowerCase() ?? "dresses";
  const price = profile?.price_max ? ` under $${Math.round(profile.price_max)}` : "";
  return `Which colors are gaining traction in ${cat}${price}?`;
}

/** Accepts ids or labels (any case); returns known ids only, deduplicated. */
function toIds(values: string[], entries: VocabEntry[]): string[] {
  const byKey = new Map<string, string>();
  for (const e of entries) {
    byKey.set(e.id.toLowerCase(), e.id);
    byKey.set(e.label.toLowerCase(), e.id);
  }
  return unique(values.map((v) => byKey.get(v.trim().toLowerCase())).filter((id): id is string => !!id));
}

const unique = <T>(xs: T[]) => [...new Set(xs)];
const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function asPrice(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

function asWindow(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : DEFAULT_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, n));
}

// ---------- keyword fallback (no AI) ----------

const FASHION_WORDS =
  /\b(trend\w*|colou?rs?|palette|shades?|silhouettes?|fabrics?|materials?|textiles?|prints?|patterns?|styles?|aesthetics?|looks?|outfits?|wear|fashion|apparel|clothing|garments?|collections?|season\w*|spring|summer|fall|autumn|winter|resort|cuts?|fits?|denim|linen|silk|wool|cotton|knit\w*|leather|sneakers?|shoes?|bags?|caps?|hats?|beanies?|jerseys?|accessor\w+|jewel\w+|merch\w*|collabs?|collaborations?|drops?|tailor\w*|preppy|streetwear|runway|catwalk)\b/i;
const COLOR_WORDS = /\b(colou?rs?|shades?|palette|hues?|red|orange|yellow|green|blue|navy|pink|purple|lilac|brown|beige|cream|white|black|gr[ae]y|neutrals?|pastels?)\b/i;
const UNSUPPORTED =
  /\b(forecast\w*|predict\w*|next (year|season)'?s? (sales|demand|revenue)|revenue|profit|stock price|design (me|a|an)|generate (an? )?(image|picture|logo|design)|draw|write (a|an|me) |legal|lawyer|weather)\b/i;

const FOCUS_WORDS: [QuestionIntent["focus"], RegExp][] = [
  ["color", COLOR_WORDS],
  ["silhouette", /\b(silhouettes?|shapes?|cuts?|fits?|lengths?)\b/i],
  ["material", /\b(fabrics?|materials?|textiles?|linen|silk|wool|cotton|denim|leather)\b/i],
  ["pattern", /\b(patterns?|prints?|stripes?|florals?|plaid|polka)\b/i],
  ["keyword", /\b(search\w*|keywords?|google|pinterest)\b/i],
  ["product", /\b(products?|items?|pieces?|best ?sellers?|styles? to stock)\b/i],
];

const EMPHASIS_WORDS: [WeightDimension, RegExp][] = [
  ["price_fit", /\b(cheap|affordable|budget|price point|under \$|below \$)/i],
  ["social_buzz", /\b(viral|tiktok|instagram|social|buzz)\b/i],
  ["growth_speed", /\b(fastest|rising|emerging|breakout|gaining|growing)\b/i],
  ["competitor_adoption", /\b(competitors?|other brands|stores? (are )?(carry|stock)\w*)\b/i],
  ["style_fit", /\b(my brand|on-brand|fits? (us|my))\b/i],
];

/** Rough, deterministic reading used when the AI is unavailable. */
export function readByKeywords(q: string, opts: Pick<ReadOptions, "vocab" | "profile">): QuestionIntent {
  const { vocab } = opts;
  const mentioned = (entries: VocabEntry[]) =>
    entries.filter((e) => wordIn(q, e.label) || wordIn(q, e.id.replace(/-/g, " "))).map((e) => e.id);
  const styleTags = unique(mentioned(vocab.styleTags));
  const categories = unique(mentioned(vocab.categories));
  const colors = mentioned(vocab.colors);

  const fashion = FASHION_WORDS.test(q) || COLOR_WORDS.test(q) || styleTags.length > 0 || categories.length > 0 || colors.length > 0;
  if (!fashion || UNSUPPORTED.test(q)) return outOfScope(opts, null);

  const { min, max } = priceRange(q);
  return {
    in_scope: true,
    suggestion: null,
    style_tags: styleTags,
    categories,
    price_min: min,
    price_max: max,
    focus: FOCUS_WORDS.find(([, re]) => re.test(q))?.[0] ?? (colors.length ? "color" : "general"),
    emphasis: EMPHASIS_WORDS.filter(([, re]) => re.test(q)).map(([d]) => d),
    time_window_days: windowDays(q),
  };
}

/** Keyword reading of a follow-up: starts from the earlier intent and changes only what the follow-up states. */
export function refineByKeywords(q: string, prev: QuestionIntent, opts: Pick<ReadOptions, "vocab" | "profile">): QuestionIntent {
  if (!prev.in_scope || UNSUPPORTED.test(q)) return outOfScope(opts, null);
  const { vocab } = opts;
  const mentioned = (entries: VocabEntry[]) =>
    unique(entries.filter((e) => wordIn(q, e.label) || wordIn(q, e.id.replace(/-/g, " "))).map((e) => e.id));
  const styleTags = mentioned(vocab.styleTags);
  const categories = mentioned(vocab.categories);
  const { min, max } = priceRange(q);
  const focus = FOCUS_WORDS.find(([, re]) => re.test(q))?.[0];
  return {
    ...prev,
    style_tags: styleTags.length ? styleTags : prev.style_tags,
    categories: categories.length ? categories : prev.categories,
    // a new price bound replaces the old range; no price in the follow-up keeps it
    price_min: min !== null || max !== null ? min : prev.price_min,
    price_max: min !== null || max !== null ? max : prev.price_max,
    focus: focus ?? prev.focus,
    emphasis: unique([...prev.emphasis, ...EMPHASIS_WORDS.filter(([, re]) => re.test(q)).map(([d]) => d)]),
    time_window_days: explicitWindow(q) ?? prev.time_window_days,
  };
}

function wordIn(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s*&\s*/g, "\\s*(&|and)\\s*");
  if (new RegExp(`\\b${escaped}s?\\b`, "i").test(text)) return true;
  // singular of a plural label ("dress" → Dresses); only for longer stems, so "top" (an adjective) doesn't hit Tops
  const stem = p.endsWith("es") && p.length > 5 ? escaped.slice(0, -2) : p.endsWith("s") ? escaped.slice(0, -1) : "";
  return stem.length >= 4 && new RegExp(`\\b${stem}\\b`, "i").test(text);
}

function priceRange(q: string): { min: number | null; max: number | null } {
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const between = q.match(/\$\s?(\d[\d,]*)\s*(?:-|–|to|and)\s*\$?\s?(\d[\d,]*)/i);
  if (between) return { min: num(between[1]), max: num(between[2]) };
  const under = q.match(/\b(?:under|below|less than|cheaper than|up to|max(?:imum)?)\s*\$\s?(\d[\d,]*)/i);
  const over = q.match(/\b(?:over|above|more than|at least|from)\s*\$\s?(\d[\d,]*)/i);
  return { min: over ? num(over[1]) : null, max: under ? num(under[1]) : null };
}

function windowDays(q: string): number {
  return explicitWindow(q) ?? DEFAULT_WINDOW_DAYS;
}

/** The time window the text actually states, or null. */
function explicitWindow(q: string): number | null {
  const n = q.match(/\b(?:last|past)\s+(\d+)\s*(day|week|month|year)s?\b/i);
  if (n) return asWindow(Number(n[1]) * { day: 1, week: 7, month: 30, year: 365 }[n[2].toLowerCase() as "day"]);
  if (/\b(this|last|past) week\b/i.test(q)) return 7;
  if (/\b(this|last|past) month\b/i.test(q)) return 30;
  if (/\b(this|last|past) year\b|\b12 months\b/i.test(q)) return 365;
  return null;
}
