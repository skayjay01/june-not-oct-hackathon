import "server-only";
import { db } from "@/lib/db/server";

// 👍/👎 on a digest element (item_key = element key) or one example (`${element.key}:${item.id}`).
// One vote per item per digest: voting again changes it (FR-6).
export async function saveVote(digestId: string, itemKey: string, vote: 1 | -1) {
  const { data: digest, error } = await db().from("digests").select("brand_id").eq("id", digestId).maybeSingle();
  if (error) throw error;
  if (!digest) throw new Error("Digest not found");
  const { error: saveError } = await db()
    .from("feedback")
    .upsert({ brand_id: digest.brand_id, digest_id: digestId, item_key: itemKey, vote, created_at: new Date().toISOString() }, { onConflict: "digest_id,item_key" });
  if (saveError) throw saveError;
}
