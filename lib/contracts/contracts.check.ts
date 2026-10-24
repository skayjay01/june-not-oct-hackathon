// Self-check: every fixture passes every validator against data/curation.
// Run: npx tsx lib/contracts/contracts.check.ts  (exits 1 on any problem)

import { readFileSync, existsSync } from "node:fs";
import { checkDashboard, checkDigest, checkProfile, checkWeights, type Vocab } from "./validate";
import { sampleBrandProfile, sampleDashboard, sampleDigest, sampleWeights } from "./fixtures";

const load = (file: string, key: string): Set<string> | undefined => {
  const path = `data/curation/${file}`;
  if (!existsSync(path)) return undefined; // curation not merged yet: skip vocab checks
  return new Set((JSON.parse(readFileSync(path, "utf8"))[key] as { id: string }[]).map((x) => x.id));
};

const vocab: Vocab = {
  colors: load("colors.json", "colors"),
  styleTags: load("style-tags.json", "tags"),
  categories: load("categories.json", "categories"),
};

const results: [string, string[]][] = [
  ["dashboard", checkDashboard(sampleDashboard)],
  ["digest", checkDigest(sampleDigest, vocab)],
  ["profile", checkProfile(sampleBrandProfile, vocab)],
  ["weights", checkWeights(sampleWeights)],
];
let bad = 0;
for (const [name, errs] of results) {
  console.log(`${errs.length ? "FAIL" : "ok  "} ${name}${errs.length ? ": " + errs.join("; ") : ""}`);
  bad += errs.length;
}
console.log(vocab.colors ? "vocab: checked against data/curation" : "vocab: data/curation not found, skipped");
process.exit(bad ? 1 : 0);
