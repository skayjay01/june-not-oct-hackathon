// Loads Blair's curation lists (data/curation/*.json) for the engine.
// colors.json uses `name` where the other files use `label`; both are accepted.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProfileVocab } from "./profiler";

interface Raw {
  id: string;
  label?: string;
  name?: string;
  cues?: string[];
}

async function readList(file: string, key: string) {
  const p = path.join(process.cwd(), "data", "curation", file);
  const json = JSON.parse(await readFile(p, "utf8")) as Record<string, Raw[]>;
  return (json[key] ?? []).map((x) => ({ id: x.id, label: x.label ?? x.name ?? x.id, cues: x.cues }));
}

let cached: Promise<ProfileVocab> | undefined;

export function loadVocab(): Promise<ProfileVocab> {
  cached ??= Promise.all([
    readList("style-tags.json", "tags"),
    readList("categories.json", "categories"),
    readList("colors.json", "colors"),
  ]).then(([styleTags, categories, colors]) => ({ styleTags, categories, colors }));
  return cached;
}
