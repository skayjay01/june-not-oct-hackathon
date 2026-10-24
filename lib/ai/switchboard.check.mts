// Self-check for the switchboard with fake models — no real AI accounts needed.
// Run: npx tsx lib/ai/switchboard.check.mts  (exits 1 on any failure)

import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { Account } from "./accounts";
import { AllAccountsFailedError, createSwitchboard, type LatencyEntry } from "./switchboard";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["color"],
  properties: { color: { type: "string" } },
} as const;

const ok = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  },
  warnings: [],
});

const httpError = (status: number, message: string) =>
  new APICallError({ message, url: "https://fake", requestBodyValues: {}, statusCode: status, isRetryable: status === 429 || status >= 500 });

function account(id: string, behaviour: () => unknown): Account & { calls: () => number } {
  let n = 0;
  const model = new MockLanguageModelV4({
    modelId: id,
    doGenerate: async () => {
      n++;
      const r = behaviour();
      if (r instanceof Error) throw r;
      return r as ReturnType<typeof ok>;
    },
  });
  return { id, provider: "anthropic", modelId: id, model, calls: () => n };
}

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const base = { step: "interpret" as const, schema, system: "Answer in JSON.", prompt: "Pick a color.", noCache: true };

await test("returns a valid answer from the first account", async () => {
  const a = account("a", () => ok('{"color":"butter-yellow"}'));
  const logs: LatencyEntry[] = [];
  const sb = createSwitchboard({ accounts: [a], log: (e) => void logs.push(e) });
  const r = await sb.generateJSON<{ color: string }>(base);
  expect(r.value.color === "butter-yellow", `got ${JSON.stringify(r.value)}`);
  expect(r.accountId === "a", "wrong account");
  expect(logs.length === 1 && logs[0].step === "interpret" && logs[0].model === "a", `latency not logged: ${JSON.stringify(logs)}`);
});

await test("out-of-quota account is skipped and cooled down", async () => {
  const a = account("a", () => httpError(429, "Resource has been exhausted (e.g. check quota)."));
  const b = account("b", () => ok('{"color":"cloud-dancer"}'));
  const sb = createSwitchboard({ accounts: [a, b] });
  const r1 = await sb.generateJSON<{ color: string }>(base);
  expect(r1.accountId === "b", `expected b, got ${r1.accountId}`);
  await sb.generateJSON<{ color: string }>(base);
  expect(a.calls() === 1, `cooled-down account was called again (${a.calls()} calls)`);
  expect(sb.status()[0].coolingForMs > 25 * 60_000, "quota cooldown should be ~30 minutes");
});

await test("bad answer gets one retry on the same account", async () => {
  let n = 0;
  const a = account("a", () => (++n === 1 ? ok("not json") : ok('{"color":"cherry-red"}')));
  const sb = createSwitchboard({ accounts: [a] });
  const r = await sb.generateJSON<{ color: string }>(base);
  expect(r.value.color === "cherry-red" && a.calls() === 2, `calls=${a.calls()} value=${JSON.stringify(r.value)}`);
});

await test("caller's validate() rejects an off-list answer, then the next account answers", async () => {
  const a = account("a", () => ok('{"color":"neon-sparkle"}'));
  const b = account("b", () => ok('{"color":"oatmeal"}'));
  const sb = createSwitchboard({ accounts: [a, b] });
  const allowed = new Set(["oatmeal", "cloud-dancer"]);
  const r = await sb.generateJSON<{ color: string }>({ ...base, validate: (v) => (allowed.has(v.color) ? [] : [`unknown color ${v.color}`]) });
  expect(r.accountId === "b" && a.calls() === 2, `account=${r.accountId} a.calls=${a.calls()}`);
});

await test("all accounts failing gives one clear error", async () => {
  const a = account("a", () => httpError(401, "invalid x-api-key"));
  const b = account("b", () => httpError(503, "overloaded"));
  const sb = createSwitchboard({ accounts: [a, b] });
  try {
    await sb.generateJSON(base);
    throw new Error("should have thrown");
  } catch (e) {
    expect(e instanceof AllAccountsFailedError && e.attempts.length === 2, `got ${(e as Error).message}`);
  }
});

await test("identical calls are served from cache", async () => {
  const a = account("a", () => ok('{"color":"ecru"}'));
  const sb = createSwitchboard({ accounts: [a] });
  await sb.generateJSON({ ...base, noCache: false });
  const r = await sb.generateJSON({ ...base, noCache: false });
  expect(r.cached && a.calls() === 1, `cached=${r.cached} calls=${a.calls()}`);
});

process.exit(failures ? 1 : 0);
