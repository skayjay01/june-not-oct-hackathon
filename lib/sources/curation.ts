import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TaggerVocab, VocabEntry } from "./tagger";

// Reads Blair's curation files (data/curation, Workstream C) for the connectors.

const dir = () => path.join(process.cwd(), "data", "curation");

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(dir(), file), "utf8")) as T;
}

/** Minimal CSV reader: header row, quoted fields with "" escapes, commas inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export async function readCsv(file: string) {
  return parseCsv(await readFile(path.join(dir(), file), "utf8"));
}

export async function loadTaggerVocab(): Promise<TaggerVocab & { styleTagIds: Set<string> }> {
  const [cats, colors, attrs, tags] = await Promise.all([
    readJson<{ categories: VocabEntry[] }>("categories.json"),
    readJson<{ colors: VocabEntry[] }>("colors.json"),
    readJson<Record<string, VocabEntry[]>>("attributes.json"),
    readJson<{ tags: VocabEntry[] }>("style-tags.json"),
  ]);
  return {
    categories: cats.categories,
    colors: colors.colors,
    silhouettes: attrs.silhouettes ?? [],
    materials: attrs.materials ?? [],
    patterns: attrs.patterns ?? [],
    styleTagIds: new Set(tags.tags.map((t) => t.id)),
  };
}
