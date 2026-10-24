// Which AI accounts the switchboard may use, in order (PRD D2, FR-16/17).
//
// Two ways to configure, both server-side env vars (never NEXT_PUBLIC_):
//
// 1. AI_ACCOUNTS — a JSON array, tried top to bottom:
//      [{"id":"gemini-1","provider":"google","apiKey":"..."},
//       {"id":"claude-1","provider":"anthropic","model":"claude-haiku-4-5","apiKey":"..."},
//       {"id":"proxy-1","provider":"openai","baseURL":"https://my-proxy.example/v1","apiKey":"..."}]
//    `baseURL` lets an account point at any OpenAI/Anthropic/Gemini-compatible endpoint,
//    e.g. a team proxy that fronts subscription credit.
//
// 2. Plain keys — GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, plus
//    numbered extras (ANTHROPIC_API_KEY_2 … _5). Order: AI_PROVIDER_ORDER
//    (default "google,anthropic,openai"). Models: AI_MODEL_GOOGLE / AI_MODEL_ANTHROPIC / AI_MODEL_OPENAI.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type Provider = "google" | "anthropic" | "openai";

/** Fast, cheap defaults (FR-18). Day 1: time these on real prompts and adjust via env. */
export const DEFAULT_MODELS: Record<Provider, string> = {
  google: "gemini-3.8-flash",
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5-mini",
};

const KEY_ENV: Record<Provider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

export interface AccountConfig {
  id: string;
  provider: Provider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface Account {
  id: string;
  provider: Provider;
  modelId: string;
  model: LanguageModel;
}

const isProvider = (p: unknown): p is Provider => p === "google" || p === "anthropic" || p === "openai";

export function loadAccountConfigs(env: Record<string, string | undefined> = process.env): AccountConfig[] {
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
      if (!a.apiKey) throw new Error(`AI_ACCOUNTS[${i}]: apiKey is missing`);
      return {
        id: a.id || `${a.provider}-${i + 1}`,
        provider: a.provider,
        model: a.model || env[`AI_MODEL_${a.provider.toUpperCase()}`] || DEFAULT_MODELS[a.provider],
        apiKey: a.apiKey,
        baseURL: a.baseURL,
      };
    });
  }

  const order = (env.AI_PROVIDER_ORDER || "google,anthropic,openai").split(",").map((s) => s.trim()).filter(isProvider);
  const out: AccountConfig[] = [];
  for (const provider of order) {
    for (const suffix of ["", "_2", "_3", "_4", "_5"]) {
      const apiKey = env[KEY_ENV[provider] + suffix];
      if (!apiKey) continue;
      out.push({
        id: `${provider}${suffix || "_1"}`.replace("_", "-"),
        provider,
        model: env[`AI_MODEL_${provider.toUpperCase()}`] || DEFAULT_MODELS[provider],
        apiKey,
      });
    }
  }
  return out;
}

export function toAccount(c: AccountConfig): Account {
  const factory =
    c.provider === "google"
      ? createGoogle({ apiKey: c.apiKey, baseURL: c.baseURL })
      : c.provider === "anthropic"
        ? createAnthropic({ apiKey: c.apiKey, baseURL: c.baseURL })
        : createOpenAI({ apiKey: c.apiKey, baseURL: c.baseURL });
  return { id: c.id, provider: c.provider, modelId: c.model, model: factory(c.model) };
}
