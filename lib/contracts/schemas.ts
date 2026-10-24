// JSON Schemas for AI structured output (A1 switchboard passes these to the model).
// Kept shallow on purpose: Gemini rejects deep schemas and drops length limits,
// and Claude rejects numeric/length constraints, so limits are enforced in code
// by the validators in ./validate.ts, not here.

const str = { type: "string" } as const;
const strOrNull = { type: ["string", "null"] } as const;
const num = { type: "number" } as const;
const numOrNull = { type: ["number", "null"] } as const;
const strArr = { type: "array", items: str } as const;

export const CHART_TYPES = ["trend_line", "ranked_bar", "image_grid", "big_number", "comparison", "color_swatches"] as const;
export const QUERY_NAMES = ["attribute_growth", "interest_over_time", "top_examples", "item_count", "segment_compare", "editorial_signals"] as const;
export const FOCUS = ["color", "silhouette", "material", "pattern", "product", "keyword", "general"] as const;

/** Question reader output → QuestionIntent */
export const questionIntentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["in_scope", "suggestion", "style_tags", "categories", "colors", "keywords", "price_min", "price_max", "focus", "emphasis", "time_window_days"],
  properties: {
    in_scope: { type: "boolean" },
    suggestion: strOrNull,
    style_tags: strArr,
    categories: strArr,
    colors: strArr,
    keywords: strArr,
    price_min: numOrNull,
    price_max: numOrNull,
    focus: { type: "string", enum: FOCUS },
    emphasis: { type: "array", items: { type: "string", enum: ["price_fit", "social_buzz", "growth_speed", "competitor_adoption", "style_fit"] } },
    time_window_days: num,
  },
} as const;

/** Dashboard planner output: the widgets to build, before data is attached. */
export const dashboardPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "widgets"],
  properties: {
    title: str,
    widgets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "chart", "query", "title", "caption", "attribute", "keywords", "limit"],
        properties: {
          id: str,
          chart: { type: "string", enum: CHART_TYPES },
          query: { type: "string", enum: QUERY_NAMES },
          title: str,
          caption: str,
          attribute: { type: ["string", "null"], enum: ["colors", "silhouette", "material", "pattern", "style_tags", null] },
          keywords: strArr,
          limit: num,
        },
      },
    },
  },
} as const;

/** Summary writer output, grounded in the attached rows. */
export const dashboardSummarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: str },
} as const;

/** Brand profiler output → BrandProfile fields */
export const brandProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["style_tags", "price_min", "price_max", "currency", "categories", "colors", "summary"],
  properties: {
    style_tags: strArr,
    price_min: numOrNull,
    price_max: numOrNull,
    currency: str,
    categories: strArr,
    colors: strArr,
    summary: str,
  },
} as const;

/** Digest builder output: elements reference candidate item ids the matcher supplied. */
export const digestPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "elements"],
  properties: {
    headline: str,
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "name", "color", "reason", "fits_because", "example_ids"],
        properties: {
          key: str,
          name: str,
          color: strOrNull,
          reason: str,
          fits_because: str,
          example_ids: { type: "array", items: num },
        },
      },
    },
  },
} as const;
