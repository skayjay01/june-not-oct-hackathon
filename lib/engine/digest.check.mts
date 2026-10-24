// Self-check for the digest builder — fake AI, real ranking/grouping/cleaning.
// Run: npx tsx lib/engine/digest.check.mts

import type { BrandProfile, Feedback, TrendItem, Weights } from "../contracts/types";
import { checkDigest } from "../contracts/validate";
import { baselineRank, buildDigestFrom, cleanDigest, groupCandidates, type RawDigest } from "./digest";

const profile: BrandProfile = {
  brand_id: "b1", style_tags: ["minimalist", "quiet-luxury"], price_min: 30, price_max: 90, currency: "USD",
  categories: ["dresses", "knitwear"], colors: ["oatmeal", "cloud-dancer"], summary: "Clean, logo-free essentials.", edited_fields: [], updated_at: "2026-10-24T00:00:00Z",
};
const weights: Weights = { brand_id: "b1", preset: null, price_fit: 20, social_buzz: 20, growth_speed: 25, competitor_adoption: 15, style_fit: 20 };
const colors = [
  { id: "butter-yellow", label: "Butter yellow" },
  { id: "cloud-dancer", label: "Cloud Dancer" },
  { id: "cherry-red", label: "Cherry red" },
  { id: "oatmeal", label: "Oatmeal" },
];

let nextId = 1;
const item = (title: string, color: string, extra: Partial<TrendItem> = {}): TrendItem => ({
  id: nextId++, source: "shopify_products", source_item_id: `x${nextId}`, brand_id: null, type: "product", title, category: "dresses",
  attributes: { colors: [color], style_tags: ["minimalist"], material: "linen" }, price: 50, currency: "USD", image_url: `https://img.example/${nextId}.jpg`,
  link: `https://shop.example/${nextId}`, metrics: { growth: 0.3, store_count: 6 }, published_at: null, collected_at: "2026-10-20T00:00:00Z", ...extra,
});
const items: TrendItem[] = [
  ...[1, 2, 3, 4].map((i) => item(`Butter yellow dress ${i}`, "butter-yellow", { metrics: { growth: 0.5, store_count: 9 } })),
  ...[1, 2, 3].map((i) => item(`Cloud Dancer shirt ${i}`, "cloud-dancer")),
  ...[1, 2].map((i) => item(`Cherry red slip ${i}`, "cherry-red")), // only 2 → not a candidate
  item("No-picture dress", "butter-yellow", { image_url: null }), // no image → skipped
  item("Keyword row", "butter-yellow", { type: "keyword" }), // not a product → skipped
];

let failures = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
  }
}
const expect = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};

const ranked = baselineRank(items, { profile, weights });
const groups = groupCandidates(ranked);
const yellowIds = groups.find((g) => g.key === "colors.butter-yellow")!.items.map((r) => r.item.id);
const whiteIds = groups.find((g) => g.key === "colors.cloud-dancer")!.items.map((r) => r.item.id);

await test("groups need 3+ pictured products; keywords and no-image rows are skipped", () => {
  expect(groups.some((g) => g.key === "colors.butter-yellow") && groups.some((g) => g.key === "colors.cloud-dancer"), `groups ${groups.map((g) => g.key)}`);
  expect(!groups.some((g) => g.key === "colors.cherry-red"), "2-item group should be dropped");
  expect(yellowIds.length === 4, `yellow should have 4 pictured products, has ${yellowIds.length}`);
});

await test("cleanDigest keeps only supplied ids, tops up to 3, maps color labels, drops unknown trends", () => {
  const raw: RawDigest = {
    headline: " Soft yellows rising ",
    elements: [
      { key: "colors.butter-yellow", name: "Butter yellow", color: "Butter yellow", reason: "Up 50%.", fits_because: "Soft and wearable.", example_ids: [yellowIds[0], 9999] },
      { key: "colors.cloud-dancer", name: "Cloud Dancer", color: "cloud-dancer", reason: "Pantone 2026.", fits_because: "Clean white.", example_ids: whiteIds },
      { key: "colors.made-up", name: "Nope", color: null, reason: "", fits_because: "", example_ids: [1, 2, 3] },
    ],
  };
  const c = cleanDigest(raw, groups, colors);
  expect(c.elements.length === 2, `expected 2 elements, got ${c.elements.length}`);
  const y = c.elements[0];
  expect(y.examples.length === 3 && y.examples[0].id === yellowIds[0] && !y.examples.some((e) => e.id === 9999), "examples not cleaned/topped up");
  expect(y.color === "butter-yellow" && c.headline === "Soft yellows rising", "color/headline not cleaned");
});

await test("full digest passes contract checks and the AI only sees real candidate ids", async () => {
  let prompt = "";
  const spec = await buildDigestFrom({
    profile, weights, items, colors, today: "2026-10-24",
    ask: async (call) => {
      prompt = call.prompt;
      return {
        headline: "Two soft shades",
        elements: [
          { key: "colors.butter-yellow", name: "Butter yellow", color: "butter-yellow", reason: "Up 50%.", fits_because: "Fits.", example_ids: yellowIds.slice(0, 3) },
          { key: "colors.cloud-dancer", name: "Cloud Dancer", color: "cloud-dancer", reason: "Up 30%.", fits_because: "Fits.", example_ids: whiteIds },
        ],
      };
    },
  });
  expect(checkDigest(spec, { colors: new Set(colors.map((c) => c.id)) }).length === 0, "digest fails checkDigest");
  expect(prompt.includes(`id ${yellowIds[0]}:`) && !prompt.includes("Keyword row") && !prompt.includes("No-picture"), "prompt candidates wrong");
});

await test("a 👎 on a whole trend keeps it out of the next digest", () => {
  const fb: Feedback[] = [{ brand_id: "b1", digest_id: "d0", item_key: "colors.butter-yellow", vote: -1 }];
  const g = groupCandidates(ranked, { dislikedKeys: new Set(fb.filter((f) => f.vote === -1 && !f.item_key.includes(":")).map((f) => f.item_key)) });
  expect(!g.some((x) => x.key === "colors.butter-yellow"), "disliked trend still offered");
});

await test("validate makes the switchboard retry when fewer than 2 trends survive", async () => {
  let problems: string[] = [];
  await buildDigestFrom({
    profile, weights, items, colors,
    ask: async (call) => {
      problems = call.validate({ headline: "x", elements: [{ key: "colors.made-up", name: "x", color: null, reason: "", fits_because: "", example_ids: [] }] });
      return { headline: "ok", elements: [
        { key: "colors.butter-yellow", name: "a", color: null, reason: "", fits_because: "", example_ids: yellowIds },
        { key: "colors.cloud-dancer", name: "b", color: null, reason: "", fits_because: "", example_ids: whiteIds },
      ] };
    },
  });
  expect(problems.length === 1 && problems[0].includes("only 0"), `got ${JSON.stringify(problems)}`);
});

await test("too little data gives a clear error", async () => {
  try {
    await buildDigestFrom({ profile, weights, items: items.slice(0, 2), colors, ask: async () => ({ headline: "", elements: [] }) });
    throw new Error("should have thrown");
  } catch (e) {
    expect((e as Error).message.includes("Not enough matching trend data"), (e as Error).message);
  }
});

process.exit(failures ? 1 : 0);
