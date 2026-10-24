// Which AI accounts the switchboard may use, in order (PRD D2, FR-16/17).
//
// D2: the app runs on the founder's Claude SUBSCRIPTION, not API keys. A subscription
// account is a Claude Code sign-in token (`claude setup-token`), sent as a Bearer token
// with the `oauth-2025-04-20` beta header — the same pattern pisr-erp already uses.
//
// Server-side env vars (never NEXT_PUBLIC_):
//   CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN_2 … _5   subscription accounts — tried first
//   GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY (+ _2 … _5)   optional key-based fallbacks
//   AI_PROVIDER_ORDER   default "claude-subscription,google,anthropic,openai"
//   AI_MODEL_ANTHROPIC / AI_MODEL_GOOGLE / AI_MODEL_OPENAI   model overrides
// Or AI_ACCOUNTS: a JSON array of {id?, provider, model?, apiKey? | authToken?, baseURL?}, tried top to bottom
// (an anthropic entry with authToken is a subscription account).

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type Provider = "google" | "anthropic" | "openai";

/** Fast, cheap defaults (FR-18). Day 1: time these on real prompts and adjust via env. */
export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.8-flash",
  openai: "gpt-5-mini",
};

export const SUBSCRIPTION_BETA = "oauth-2025-04-20";

const KEY_ENV: Record<Provider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

export interface AccountConfig {
  id: string;
  provider: Provider;
  model: string;
  /** an API key… */
  apiKey?: string;
  /** …or a subscription sign-in token (anthropic only) */
  authToken?: string;
  baseURL?: string;
}

export interface Account {
  id: string;
  provider: Provider;
  modelId: string;
  model: LanguageModel;
}

const isProvider = (p: unknown): p is Provider => p === "google" || p === "anthropic" || p === "openai";
const SUFFIXES = ["", "_2", "_3", "_4", "_5"];

export function loadAccountConfigs(env: Record<string, string | undefined> = process.env): AccountConfig[] {
  const modelFor = (p: Provider) => env[`AI_MODEL_${p.toUpperCase()}`] || DEFAULT_MODELS[p];

  if (env.AI_ACCOUNTS?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.AI_ACCOUNTS);
    } catch {
      throw new Error("AI_ACCOUNTS is not valid JSON");
    }
    if (!Array.isArray(parsed)) throw new Error("AI_ACCOUNTS must be a JSON array");
    return parsed.map((raw, i) => {
      const a = raw as Partial<AccountConfig>;
      if (!isProvider(a.provider)) throw new Error(`AI_ACCOUNTS[${i}]: provider must be google, anthropic or openai`);
      if (!a.apiKey && !a.authToken) throw new Error(`AI_ACCOUNTS[${i}]: needs apiKey or authToken`);
      if (a.authToken && a.provider !== "anthropic") throw new Error(`AI_ACCOUNTS[${i}]: authToken (subscription) is only supported for anthropic`);
      return { id: a.id || `${a.provider}-${i + 1}`, provider: a.provider, model: a.model || modelFor(a.provider), apiKey: a.apiKey, authToken: a.authToken, baseURL: a.baseURL };
    });
  }

  const order = (env.AI_PROVIDER_ORDER || "claude-subscription,google,anthropic,openai").split(",").map((s) => s.trim());
  const out: AccountConfig[] = [];
  for (const entry of order) {
    if (entry === "claude-subscription") {
      SUFFIXES.forEach((suffix, i) => {
        const authToken = env["CLAUDE_CODE_OAUTH_TOKEN" + suffix];
        if (authToken) out.push({ id: `claude-sub-${i + 1}`, provider: "anthropic", model: modelFor("anthropic"), authToken });
      });
      continue;
    }
    if (!isProvider(entry)) continue;
    SUFFIXES.forEach((suffix, i) => {
      const apiKey = env[KEY_ENV[entry] + suffix];
      if (apiKey) out.push({ id: `${entry}-key-${i + 1}`, provider: entry, model: modelFor(entry), apiKey });
    });
  }
  return out;
}

/** `fetchImpl` is for tests: it lets a check inspect requests without calling the network. */
export function toAccount(c: AccountConfig, fetchImpl?: typeof fetch): Account {
  const f = fetchImpl ? { fetch: fetchImpl } : {};
  const factory =
    c.provider === "anthropic"
      ? c.authToken
        ? createAnthropic({ authToken: c.authToken, baseURL: c.baseURL, headers: { "anthropic-beta": SUBSCRIPTION_BETA }, ...f })
        : createAnthropic({ apiKey: c.apiKey, baseURL: c.baseURL, ...f })
      : c.provider === "google"
        ? createGoogle({ apiKey: c.apiKey, baseURL: c.baseURL, ...f })
        : createOpenAI({ apiKey: c.apiKey, baseURL: c.baseURL, ...f });
  return { id: c.id, provider: c.provider, modelId: c.model, model: factory(c.model) };
}
