"use server";

import { saveVote } from "@/lib/delivery/feedback";
import { verifyVote } from "@/lib/delivery/links";

export async function recordSignedVote(digestId: string, itemKey: string, vote: 1 | -1, sig: string): Promise<boolean> {
  if (!verifyVote(digestId, itemKey, vote, sig)) return false;
  await saveVote(digestId, itemKey, vote);
  return true;
}
