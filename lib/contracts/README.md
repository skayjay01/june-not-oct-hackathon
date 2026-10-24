# Shared contracts (A0)

The hand-off points between the three workstreams. Owner: Yishan. Change by PR and tell the others.

| File | What it is | Who uses it |
|---|---|---|
| `types.ts` | Data shapes (`TrendItem`, `BrandProfile`, `Weights`, `DashboardSpec`, `DigestSpec`, `Feedback`, `QuestionIntent`) and the function boundaries (`Engine`, `Plumbing`) | Everyone |
| `schemas.ts` | JSON Schemas the AI must answer in (question intent, dashboard plan, summary, brand profile, digest plan) | Engine (A) |
| `validate.ts` | Checks schemas can't express: 2–4 digest elements, 3–5 examples, ids from `data/curation`, weights totaling 100 | Engine (A), app (B) |
| `fixtures.ts` | Sample data: 4 trend items, a brand profile, weights, a full dashboard, a digest | App (B) builds screens against these until the engine is live |

**Field names are snake_case** to match the Supabase tables in `supabase/migrations` one-to-one.

**Vocabulary ids** (style tags, colors, categories, attributes) come from Blair's `data/curation/*.json`. Code stores the `id`; screens show the `label`.

**Import:** `import { sampleDashboard, type DashboardSpec } from "@/lib/contracts";`
