// Live check of the question reader against the real AI (Blair's 5 demo questions + 5 off-topic ones).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/eval-question-reader.mts  (exit 1 if any is wrong)
import { ai } from "@/lib/ai";
import { loadQuestionVocab, readQuestion } from "@/lib/engine/question-reader";

const vocab = loadQuestionVocab();
const cases: [string, boolean][] = [
  ["Should our spring 2027 dresses lean green or orange?", true],
  ["Is butter yellow still rising, or has it peaked?", true],
  ["Which prints should we add for fall?", true],
  ["Is preppy tailoring coming back for spring 2027?", true],
  ["How big is the sports-merch moment, and should we do a team collab?", true],
  ["What's the weather in Boston tomorrow?", false],
  ["How do I fix a TypeScript build error?", false],
  ["Forecast our dress sales for next year", false],
  ["Design me a logo for my brand", false],
  ["What is Zara's revenue this quarter?", false],
];
let wrong = 0;
for (const [q, want] of cases) {
  const r = await readQuestion(q, { vocab, ask: async (c) => (await ai().generateJSON({ ...c, step: "interpret", schema: c.schema as Readonly<Record<string, unknown>>, noCache: true })).value });
  const ok = r.intent.in_scope === want;
  if (!ok) wrong++;
  console.log(`${ok ? "ok  " : "WRONG"} [${r.via}] in_scope=${r.intent.in_scope} focus=${r.intent.focus} cats=${r.intent.categories} tags=${r.intent.style_tags} colors=${(r.intent.colors ?? []).length} | ${q}${r.intent.suggestion ? `\n      suggestion: ${r.intent.suggestion}` : ""}`);
}
console.log(`${cases.length - wrong}/${cases.length} correct`);
process.exit(wrong ? 1 : 0);
