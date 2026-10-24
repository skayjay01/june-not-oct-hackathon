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

**Runs on the Claude subscription, not API keys (PRD decision D2).** Each account is a Claude Code sign-in token, sent as a Bearer token with the `oauth-2025-04-20` beta header — the same pattern pisr-erp uses.

**What it does**
- Tries each account in order. Usage limit reached, rate-limited, bad token or Claude down → that account cools down (30 min for usage limits or auth, 1 min for brief rate limits, 15 s for outages) and the next account answers.
- Forces JSON that matches the schema. A malformed answer, or one your `validate` rejects, gets one retry on the same account, then moves on.
- Logs time per call into `latency_log`, and caches identical calls for 10 minutes (pass `noCache: true` to skip).
- Throws `AllAccountsFailedError` listing every attempt if nothing works.

**Configure** (server-only env vars in Vercel and `.env.local`; never `NEXT_PUBLIC_`)
- `CLAUDE_CODE_OAUTH_TOKEN` — one subscription account. Generate with `claude setup-token` while signed in to the subscription. More accounts: `CLAUDE_CODE_OAUTH_TOKEN_2` … `_5`.
- Model: `claude-haiku-4-5` by default; override with `AI_MODEL_ANTHROPIC`.
- Optional key-based fallbacks, off unless set: `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (+ `_2` … `_5`). Order: `AI_PROVIDER_ORDER` (default `claude-subscription,google,anthropic,openai`).
- Full control: `AI_ACCOUNTS` as a JSON array of `{id, provider, model?, apiKey? | authToken?, baseURL?}`.

**Test without any accounts:** `npx tsx lib/ai/switchboard.check.mts` (fake models and a fake network; checks failover, retry, validation, cache, account order, and that subscription requests carry the right sign-in headers).
