"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { checkWeights, WEIGHT_DIMENSIONS, type Weights } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { disconnectLicensed, importLicensedCsv, LICENSED_SOURCES, type LicensedKey } from "@/lib/sources/licensed";
import { forgetBrand } from "@/app/current-brand";

export type Result = { ok: boolean; message: string };

export async function saveWeights(brandId: string, weights: Record<string, number>, preset: string | null): Promise<Result> {
  const row = { brand_id: brandId, preset, ...Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, Math.round(Number(weights[d]))])) } as Weights;
  const problems = checkWeights(row);
  if (problems.length) return { ok: false, message: `Not saved: ${problems.join("; ")}.` };
  const { error } = await db().from("weights").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Saved. Your digests and dashboards now rank with these weights." };
}

export async function saveDelivery(brandId: string, _prev: Result, form: FormData): Promise<Result> {
  const channel = String(form.get("channel") ?? "");
  const frequency = String(form.get("frequency") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const slack = String(form.get("slack_webhook") ?? "").trim();
  if (!["email", "slack", "whatsapp"].includes(channel) || !["daily", "weekly"].includes(frequency)) return { ok: false, message: "Pick a channel and how often." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "That email address doesn't look right." };
  if (channel === "email" && !email) return { ok: false, message: "Add the email the digest should go to." };
  if (slack && !slack.startsWith("https://hooks.slack.com/")) return { ok: false, message: "Slack webhook links start with https://hooks.slack.com/" };
  if (channel === "slack" && !slack) return { ok: false, message: "Add the Slack webhook link." };
  const { error } = await db()
    .from("brands")
    .update({ digest_channel: channel, digest_frequency: frequency, email: email || null, slack_webhook_url: slack || null })
    .eq("id", brandId);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: "Saved." };
}

const MAX_BYTES = 900_000; // server actions accept ~1 MB bodies by default

export async function uploadLicensed(brandId: string, key: LicensedKey, _prev: Result, form: FormData): Promise<Result> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is over 900 KB. Split it into smaller exports." };
  if (!LICENSED_SOURCES.some((s) => s.key === key)) return { ok: false, message: "Unknown source." };
  try {
    const { rows, skipped } = await importLicensedCsv(brandId, key, await file.text());
    refresh();
    return { ok: true, message: `Imported ${rows} rows${skipped ? ` (skipped ${skipped} without a title)` : ""}. Only your brand sees them.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnect(brandId: string, key: LicensedKey) {
  await disconnectLicensed(brandId, key);
  refresh();
}

// Deletes the brand and everything that belongs to it (profile, crawled text, weights, digests,
// feedback, saved answers, licensed data) via the tables' ON DELETE CASCADE.
export async function deleteBrand(brandId: string, _prev: Result, form: FormData): Promise<Result> {
  const { data: brand, error } = await db().from("brands").select("name").eq("id", brandId).maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!brand) return { ok: false, message: "This brand no longer exists." };
  if (String(form.get("confirm") ?? "").trim() !== brand.name) return { ok: false, message: `Type the brand name exactly to confirm: ${brand.name}` };
  const { error: delError } = await db().from("brands").delete().eq("id", brandId);
  if (delError) return { ok: false, message: delError.message };
  await forgetBrand(brandId);
  redirect("/");
}
