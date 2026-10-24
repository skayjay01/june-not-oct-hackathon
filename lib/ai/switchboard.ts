// A1 — the one door every AI call goes through (PRD FR-16 to FR-20).
//
// - Tries accounts in order; a quota, rate-limit, auth or server error puts that
//   account on a cooldown and moves to the next one, so the user never sees it (FR-17).
// - Always asks for JSON matching a schema; an answer that fails parsing or the
//   caller's `validate` gets one retry on the same account, then moves on.
// - Logs how long each call took, per step (FR-20), and caches identical calls briefly.

import { APICallError, generateText, jsonSchema, NoObjectGeneratedError, Output, type JSONSchema7 } from "ai";
import type { Account, Provider } from "./accounts";

/** Matches latency_log.step in supabase/migrations. */
export type Step = "interpret" | "assemble" | "design" | "profile" | "digest";

export interface JsonCall<T> {
  step: Step;
  schema: JSONSchema7 | Readonly<Record<string, unknown>>;
  schemaName?: string;
  system: string;
  prompt: string;
  requestId?: string;
  /** extra checks (e.g. lib/contracts/validate); return problems, [] = ok */
  validate?: (value: T) => string[];
  timeoutMs?: number;
  /** skip the short-lived cache, e.g. for digests that should vary */
  noCache?: boolean;
}

export interface Attempt {
  accountId: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface JsonResult<T> {
  value: T;
  accountId: string;
  model: string;
  ms: number;
  cached: boolean;
  attempts: Attempt[];
}

export interface LatencyEntry {
  request_id: string;
  step: Step;
  ms: number;
  model: string | null;
}

export class AllAccountsFailedError extends Error {
  constructor(public attempts: Attempt[]) {
    super(
      attempts.length
        ? `All AI accounts failed: ${attempts.map((a) => `${a.accountId}: ${a.error}`).join(" | ")}`
        : "No AI accounts are available (none configured, or all cooling down)",
    );
    this.name = "AllAccountsFailedError";
  }
}

export interface SwitchboardOptions {
  accounts: Account[];
  log?: (entry: LatencyEntry) => void | Promise<void>;
  now?: () => number;
  cacheTtlMs?: number;
}

/** "Think less, answer faster" per provider (latency is the main risk, PRD §8). */
const SPEED_OPTIONS: Record<Provider, Record<string, Record<string, unknown>>> = {
  google: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  openai: { openai: { reasoningEffort: "low" } },
  anthropic: {},
};

const COOLDOWN = { rateLimit: 60_000, quotaOrAuth: 30 * 60_000, server: 15_000 };

type Failure = { kind: "retry-same" | "next" | "cooldown"; cooldownMs?: number; message: string };

function classify(err: unknown): Failure {
  if (NoObjectGeneratedError.isInstance(err)) return { kind: "retry-same", message: "answer did not match the schema" };
  if (APICallError.isInstance(err)) {
    const s = err.statusCode ?? 0;
    const msg = `HTTP ${s || "?"} ${err.message}`.slice(0, 200);
    if (s === 429) {
      const quota = /quota|exhaust|billing|credit/i.test(err.message + (err.responseBody ?? ""));
      return { kind: "cooldown", cooldownMs: quota ? COOLDOWN.quotaOrAuth : COOLDOWN.rateLimit, message: msg };
    }
    if (s === 401 || s === 402 || s === 403) return { kind: "cooldown", cooldownMs: COOLDOWN.quotaOrAuth, message: msg };
    if (s >= 500 || err.isRetryable) return { kind: "cooldown", cooldownMs: COOLDOWN.server, message: msg };
    return { kind: "next", message: msg }; // 400s: this model rejected the request; another may not
  }
  const name = (err as Error)?.name;
  if (name === "AbortError" || name === "TimeoutError") return { kind: "next", message: "timed out" };
  return { kind: "next", message: String((err as Error)?.message ?? err).slice(0, 200) };
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createSwitchboard(opts: SwitchboardOptions) {
  const now = opts.now ?? Date.now;
  const cacheTtl = opts.cacheTtlMs ?? 10 * 60_000;
  const coolingUntil = new Map<string, number>();
  const cache = new Map<string, { at: number; result: JsonResult<unknown> }>();

  async function log(entry: LatencyEntry) {
    try {
      await opts.log?.(entry);
    } catch {
      // timing logs must never break a user request
    }
  }

  async function generateJSON<T>(call: JsonCall<T>): Promise<JsonResult<T>> {
    const requestId = call.requestId ?? crypto.randomUUID();
    const started = now();

    const key = call.noCache ? null : await hash(JSON.stringify([call.step, call.system, call.prompt, call.schema]));
    if (key) {
      const hit = cache.get(key);
      if (hit && now() - hit.at < cacheTtl) return { ...(hit.result as JsonResult<T>), cached: true, ms: 0 };
    }

    const attempts: Attempt[] = [];
    for (const account of opts.accounts) {
      if ((coolingUntil.get(account.id) ?? 0) > now()) continue;

      for (let tryNo = 1; tryNo <= 2; tryNo++) {
        const t0 = now();
        try {
          const res = await generateText({
            model: account.model,
            system: call.system,
            prompt: call.prompt,
            output: Output.object({ schema: jsonSchema<T>(call.schema as JSONSchema7), name: call.schemaName }),
            maxRetries: 0, // the switchboard does the retrying, across accounts
            abortSignal: AbortSignal.timeout(call.timeoutMs ?? 45_000),
            providerOptions: SPEED_OPTIONS[account.provider] as never,
          });
          const value = res.output as T;
          const problems = call.validate?.(value) ?? [];
          if (problems.length) throw Object.assign(new Error(problems.join("; ")), { name: "ValidationFailed" });

          const ms = now() - t0;
          attempts.push({ accountId: account.id, ok: true, ms });
          await log({ request_id: requestId, step: call.step, ms: now() - started, model: account.modelId });
          const result: JsonResult<T> = { value, accountId: account.id, model: account.modelId, ms: now() - started, cached: false, attempts };
          if (key) {
            cache.set(key, { at: now(), result });
            if (cache.size > 200) cache.delete(cache.keys().next().value as string);
          }
          return result;
        } catch (err) {
          const isValidation = (err as Error)?.name === "ValidationFailed";
          const f: Failure = isValidation ? { kind: "retry-same", message: `invalid answer: ${(err as Error).message}` } : classify(err);
          attempts.push({ accountId: account.id, ok: false, ms: now() - t0, error: f.message });
          if (f.kind === "retry-same" && tryNo === 1) continue;
          if (f.kind === "cooldown") coolingUntil.set(account.id, now() + (f.cooldownMs ?? 0));
          break; // next account
        }
      }
    }
    await log({ request_id: requestId, step: call.step, ms: now() - started, model: null });
    throw new AllAccountsFailedError(attempts);
  }

  /** Which accounts are usable right now — for a status page or debugging. */
  function status() {
    return opts.accounts.map((a) => ({ id: a.id, model: a.modelId, coolingForMs: Math.max(0, (coolingUntil.get(a.id) ?? 0) - now()) }));
  }

  return { generateJSON, status };
}

export type Switchboard = ReturnType<typeof createSwitchboard>;
