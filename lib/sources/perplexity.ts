import "server-only";
import { db } from "@/lib/db/server";
import { loadTaggerVocab } from "./curation";
import type { TrendRow } from "./store-products";
import { makeTagger } from "./tagger";

// Perplexity, connected with the brand's own API key (bring your own licence, FR-8). Each sync asks
// Perplexity's Agent API to search the last month of fashion coverage for trends that fit this
// brand's profile, and saves them as that brand's private trend items, each with its source link.
// Perplexity bills the brand's own API account for every call (roughly a few cents per sync).

export const PERPLEXITY_KEY = "byol_perplexity";
const ENDPOINT = "https://api.perplexity.ai/v1/agent";
const MAX_ITEMS = 12;

export class ConnectionError extends Error {}

type AgentOutput = {
  type?: string;
  content?: { type?: string; text?: string }[];
  results?: { title?: string; url?: string; date?: string }[];
};

async function callAgent(apiKey: string, body: Record<string, unknown>, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ stream: false, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ConnectionError(`Couldn't reach Perplexity: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 401) throw new ConnectionError("Perplexity rejected this API key. Check it's copied in full and still active.");
  if (res.status === 402 || res.status === 429) {
    throw new ConnectionError("Perplexity says this account is out of API credit or over its limit. Add credit in Perplexity's API settings.");
  }
  if (!res.ok) throw new ConnectionError(`Perplexity error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { output?: AgentOutput[]; error?: { message?: string } };
  if (json.error?.message) throw new ConnectionError(`Perplexity error: ${json.error.message}`);
  const output = json.output ?? [];
  const text = output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .map((c) => c.text ?? "")
    .join("");
  const sources = output.filter((o) => o.type === "search_results").flatMap((o) => o.results ?? []);
  return { text, sources };
}

/** Cheapest possible call, to prove the key works before saving it. */
export async function checkPerplexityKey(apiKey: string): Promise<void> {
  if (!/^pplx-[A-Za-z0-9]{20,}$/.test(apiKey)) throw new ConnectionError("Perplexity API keys start with pplx- and are about 50 characters long.");
  await callAgent(apiKey, { effort: "fast", input: "Reply with the word OK.", max_output_tokens: 16 }, 30_000);
}

const SCHEMA = {
  type: "object",
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short trend name, e.g. 'butter yellow slip dresses'" },
          category: { type: "string", description: "Garment or accessory type" },
          colors: { type: "array", items: { type: "string" } },
          material: { type: "string" },
          pattern: { type: "string" },
          reason: { type: "string", description: "One sentence: the evidence it is rising" },
          source_url: { type: "string", description: "URL of the article or page this comes from" },
          published: { type: "string", description: "Publication date of that source, YYYY-MM-DD" },
        },
        required: ["title", "reason", "source_url"],
      },
    },
  },
  required: ["trends"],
};

type Profile = { style_tags: string[]; categories: string[]; colors: string[]; summary: string | null; price_min: number | null; price_max: number | null; currency: string };

function prompt(brandName: string, p: Profile | null) {
  const lines = [
    `Find ${MAX_ITEMS} specific fashion trends that are rising right now (last 30 days) and would suit the brand "${brandName}".`,
    p?.summary ? `Brand summary: ${p.summary}` : "",
    p?.style_tags.length ? `Style: ${p.style_tags.join(", ")}.` : "",
    p?.categories.length ? `Main categories: ${p.categories.join(", ")}.` : "",
    p?.colors.length ? `Typical colors: ${p.colors.join(", ")}.` : "",
    p?.price_min != null && p?.price_max != null ? `Price range: ${p.price_min}-${p.price_max} ${p.currency}.` : "",
    "Use fashion press, runway and street-style coverage, retailer new-in pages and search-trend reports.",
    "Each trend must be concrete (a garment, color, fabric or pattern, not a mood) and cite the page it comes from.",
  ];
  return lines.filter(Boolean).join("\n");
}

function parseTrends(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new ConnectionError("Perplexity's answer had no trend list in it.");
  const parsed = JSON.parse(text.slice(start, end + 1)) as { trends?: Record<string, unknown>[] };
  return (parsed.trends ?? []).slice(0, MAX_ITEMS);
}

/** Pulls fresh trends with the brand's key and replaces that brand's earlier Perplexity rows. */
export async function syncPerplexity(brandId: string, apiKey: string): Promise<number> {
  const [{ data: brand, error }, { data: profile }] = await Promise.all([
    db().from("brands").select("name").eq("id", brandId).single(),
    db().from("brand_profiles").select("style_tags, categories, colors, summary, price_min, price_max, currency").eq("brand_id", brandId).maybeSingle(),
  ]);
  if (error) throw error;

  const { text, sources } = await callAgent(
    apiKey,
    {
      effort: "fast",
      input: prompt(brand.name, profile as Profile | null),
      max_output_tokens: 4000,
      tools: [{ type: "web_search", max_results: 20, filters: { search_recency_filter: "month" } }],
      response_format: { type: "json_schema", json_schema: { name: "trends", schema: SCHEMA } },
    },
    120_000,
  );
  const trends = parseTrends(text);
  if (!trends.length) throw new ConnectionError("Perplexity found no trends this time. Try again later.");

  const tag = makeTagger(await loadTaggerVocab());
  const dateFor = new Map(sources.filter((s) => s.url && s.date).map((s) => [s.url!, s.date!]));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const now = new Date().toISOString();
  const rows: TrendRow[] = trends
    .filter((t) => str(t.title))
    .map((t) => {
      const title = str(t.title).slice(0, 200);
      const link = /^https?:\/\//.test(str(t.source_url)) ? str(t.source_url) : null;
      const colors = Array.isArray(t.colors) ? t.colors.filter((c): c is string => typeof c === "string") : [];
      const tags = tag({ title, productType: str(t.category), colorValues: colors, description: [str(t.material), str(t.pattern), str(t.reason)].join(" ") });
      const date = str(t.published) || (link ? dateFor.get(link) ?? "" : "");
      const type: TrendRow["type"] = tags.category ? "keyword" : tags.material ? "fabric" : tags.pattern ? "pattern" : tags.colors.length ? "color" : "keyword";
      return {
        source: PERPLEXITY_KEY,
        source_item_id: title.toLowerCase(),
        brand_id: brandId,
        type,
        title,
        category: tags.category,
        attributes: {
          colors: tags.colors,
          ...(tags.material ? { material: tags.material } : {}),
          ...(tags.pattern ? { pattern: tags.pattern } : {}),
          ...(tags.silhouette ? { silhouette: tags.silhouette } : {}),
        },
        price: null,
        currency: null,
        image_url: null,
        link,
        metrics: {},
        published_at: /^\d{4}-\d{2}-\d{2}/.test(date) ? new Date(date.slice(0, 10)).toISOString() : null,
        collected_at: now,
      };
    });

  const { error: srcError } = await db()
    .from("sources")
    .upsert(
      { key: PERPLEXITY_KEY, name: "Perplexity (your licence)", licensed: true, enabled: true, terms_url: "https://www.perplexity.ai/hub/legal/api-terms-of-service", terms_notes: "Bring your own licence: called with the brand's own Perplexity API key; results visible to that brand only (FR-8)" },
      { onConflict: "key", ignoreDuplicates: true },
    );
  if (srcError) throw srcError;
  const { error: delError } = await db().from("trend_items").delete().eq("brand_id", brandId).eq("source", PERPLEXITY_KEY);
  if (delError) throw delError;
  const { error: insError } = await db().from("trend_items").upsert(rows, { onConflict: "source,source_item_id,brand_id" });
  if (insError) throw insError;
  return rows.length;
}
