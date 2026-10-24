# AI switchboard (A1)

Every AI call in the app goes through `ai().generateJSON(...)`. Owner: Yishan.

```ts
import { ai } from "@/lib/ai";
import { questionIntentSchema, type QuestionIntent } from "@/lib/contracts";

const { value } = await ai().generateJSON<QuestionIntent>({
  step: "interpret",
  schema: questionIntentSchema,
  system: "You read fashion trend questions…",
  prompt: question,
});
```

**What it does**
- Tries each configured account in order. Out of quota, rate-limited, bad key or provider down → that account cools down (1 min for rate limits, 30 min for quota or auth, 15 s for outages) and the next one answers.
- Forces JSON that matches the schema. A malformed answer, or one your `validate` rejects, gets one retry on the same account, then moves on.
- Uses fast settings: low thinking on Gemini and OpenAI.
- Logs time per call into `latency_log`, and caches identical calls for 10 minutes (pass `noCache: true` to skip).
- Throws `AllAccountsFailedError` listing every attempt if nothing works.

**Configure** (server-only env vars in Vercel and `.env.local`; never `NEXT_PUBLIC_`)
- Simple: `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, plus extra accounts as `_2` … `_5`. Order with `AI_PROVIDER_ORDER` (default `google,anthropic,openai`).
- Full control: `AI_ACCOUNTS` as a JSON array of `{id, provider, model?, apiKey, baseURL?}`. `baseURL` points an account at any compatible endpoint (e.g. a team proxy).
- Models default to `gemini-3.8-flash`, `claude-haiku-4-5`, `gpt-5-mini`; override with `AI_MODEL_GOOGLE` / `AI_MODEL_ANTHROPIC` / `AI_MODEL_OPENAI`.

**Test without any accounts:** `npx tsx lib/ai/switchboard.check.mts` (fake models; checks failover, retry, validation, cache).
