"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { checkProfile, type BrandProfile } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { PASTED_SITE_URL } from "@/lib/engine/brand-research";
import { runOnboarding } from "@/lib/sources/onboard-brand";
import { editorVocab } from "./vocab";

export type SaveState = { ok: boolean; message: string };

type Editable = BrandProfile["edited_fields"][number];

const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

function money(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
}

export async function saveProfile(brandId: string, _prev: SaveState, form: FormData): Promise<SaveState> {
  const { data: current, error } = await db().from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!current) return { ok: false, message: "There's no profile to edit yet." };
  const prev = current as BrandProfile;

  const vocab = await editorVocab();
  const next = {
    style_tags: form.getAll("style_tags").map(String),
    categories: form.getAll("categories").map(String),
    colors: form.getAll("colors").map(String),
    price_min: money(form.get("price_min")),
    price_max: money(form.get("price_max")),
    summary: String(form.get("summary") ?? "").trim() || null,
  };

  const problems = checkProfile(next, {
    styleTags: new Set(vocab.styleTags.map((o) => o.id)),
    categories: new Set(vocab.categories.map((o) => o.id)),
    colors: new Set(vocab.colors.map((o) => o.id)),
  });
  if (Number.isNaN(next.price_min) || Number.isNaN(next.price_max)) problems.push("prices must be numbers");
  else if (next.price_min != null && next.price_max != null && next.price_min > next.price_max) {
    problems.push("the lowest price is above the highest");
  }
  if (problems.length) return { ok: false, message: `Not saved: ${problems.join("; ")}.` };

  // Remember every field the founder changed, so a later re-crawl keeps their version (US-002).
  const edited = new Set<Editable>(prev.edited_fields);
  for (const k of ["style_tags", "categories", "colors"] as const) if (!sameList(prev[k], next[k])) edited.add(k);
  for (const k of ["price_min", "price_max", "summary"] as const) if ((prev[k] ?? null) !== next[k]) edited.add(k);

  const { error: saveError } = await db()
    .from("brand_profiles")
    .update({ ...next, edited_fields: [...edited], updated_at: new Date().toISOString() })
    .eq("brand_id", brandId);
  if (saveError) return { ok: false, message: saveError.message };
  refresh();
  return { ok: true, message: "Saved. Your edits will be kept when we re-read your site." };
}

/** Text the founder pasted from their own site (when we couldn't read it), then rebuild the profile with it. */
export async function pasteSiteText(brandId: string, _prev: SaveState, form: FormData): Promise<SaveState> {
  const text = String(form.get("site_text") ?? "").trim();
  if (text.length < 80) return { ok: false, message: "Paste a bit more: a paragraph or two from your About page, or a few product descriptions." };
  const { error } = await db()
    .from("crawl_pages")
    .upsert({ brand_id: brandId, url: PASTED_SITE_URL, kind: "about", text: text.slice(0, 20_000), fetched_at: new Date().toISOString() }, { onConflict: "brand_id,url,kind" });
  if (error) return { ok: false, message: `Couldn't save it: ${error.message}` };
  await recrawl(brandId);
  return { ok: true, message: "Got it. We're rebuilding your profile with your text." };
}

export async function recrawl(brandId: string) {
  const { error } = await db().from("brands").update({ crawl_status: "running" }).eq("id", brandId);
  if (error) throw error;
  after(() => runOnboarding(brandId));
  refresh();
}
