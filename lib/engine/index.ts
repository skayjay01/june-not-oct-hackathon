import "server-only";
import type { Engine } from "@/lib/contracts";
import { answerQuestion, getEvidence, rerankDashboard } from "./answer-question";
import { buildDigest } from "./build-digest";
import { buildProfile } from "./build-profile";
import { findBrand } from "./find-brand";
import { rankItems } from "./matcher";

/**
 * The engine the app calls (build-plan "Engine functions"). Server only.
 *   import { engine } from "@/lib/engine";
 *   for await (const event of engine.answerQuestion(brandId, question)) …
 */
export const engine: Engine = {
  buildProfile,
  answerQuestion,
  // digests rank with the A4 matcher (weights, style fit, 👍/👎) instead of the baseline
  buildDigest: (brandId) => buildDigest(brandId, { rank: rankItems }),
  rerankDashboard,
  getEvidence,
  findBrand,
};
