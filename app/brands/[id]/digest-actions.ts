"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db/server";
import { engine } from "@/lib/engine";
import { DeliveryError, sendDigest, type Channel } from "@/lib/delivery/send-digest";

export type TestDigestState = { ok: boolean; message: string; digestId?: string };

// "Send test digest now" (US-004): build a fresh digest and send it by the brand's channel.
// If delivery isn't set up, the digest is still saved and viewable on the web.
export async function sendTestDigest(brandId: string): Promise<TestDigestState> {
  const { data: brand, error } = await db().from("brands").select("digest_channel").eq("id", brandId).single();
  if (error) return { ok: false, message: error.message };
  let digestId: string | undefined;
  try {
    const digest = await engine.buildDigest(brandId);
    digestId = digest.id;
    await sendDigest(brandId, digest, brand.digest_channel as Channel);
    refresh();
    return { ok: true, message: `Sent by ${brand.digest_channel}.`, digestId };
  } catch (e) {
    refresh();
    const msg = e instanceof Error ? e.message : String(e);
    if (digestId && e instanceof DeliveryError) return { ok: false, message: `Digest built, but not sent: ${msg}`, digestId };
    return { ok: false, message: `Couldn't build the digest: ${msg}` };
  }
}
