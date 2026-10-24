import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/server";

// Example questions: Blair's demo questions (data/curation/demo-set.md, "### 1. …" headings).
const FALLBACK = ["Which colors are rising in dresses under $100?", "Which prints should we add for fall?", "Is butter yellow still rising, or has it peaked?"];

export async function exampleQuestions(): Promise<string[]> {
  try {
    const md = await readFile(path.join(process.cwd(), "data", "curation", "demo-set.md"), "utf8");
    const qs = [...md.matchAll(/^###\s+\d+\.\s+(.+\?)\s*$/gm)].map((m) => m[1].trim());
    return qs.length ? qs.slice(0, 5) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Brands that have a style profile; answers are matched to one of them. */
export async function brandsWithProfiles(): Promise<{ id: string; name: string }[]> {
  const { data } = await db().from("brands").select("id, name, brand_profiles!inner(brand_id)").order("name");
  return (data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
}
