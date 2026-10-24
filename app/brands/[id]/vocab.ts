import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Blair's lists (data/curation) with what the editor needs to display them: labels, hex, families.

export type Option = { id: string; label: string; hint?: string; hex?: string; group?: string };
export type EditorVocab = { styleTags: Option[]; categories: Option[]; colors: Option[] };

type Raw = { id: string; label?: string; name?: string; definition?: string; hex?: string; family?: string; parent?: string };

async function list(file: string, key: string): Promise<Raw[]> {
  const json = JSON.parse(await readFile(path.join(process.cwd(), "data", "curation", file), "utf8"));
  return json[key] ?? [];
}

let cached: Promise<EditorVocab> | undefined;

export function editorVocab(): Promise<EditorVocab> {
  cached ??= Promise.all([list("style-tags.json", "tags"), list("categories.json", "categories"), list("colors.json", "colors")]).then(
    ([tags, cats, colors]) => ({
      styleTags: tags.map((t) => ({ id: t.id, label: t.label ?? t.id, hint: t.definition })),
      categories: cats.map((c) => ({ id: c.id, label: c.label ?? c.id, group: c.parent })),
      colors: colors.map((c) => ({ id: c.id, label: c.name ?? c.label ?? c.id, hex: c.hex, group: c.family })),
    }),
  );
  return cached;
}
