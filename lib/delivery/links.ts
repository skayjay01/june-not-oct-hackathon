import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Absolute links that go out in emails and Slack messages: the digest's web view and signed 👍/👎 links.

/** This deployment's public address: production URL in production, the preview's own URL on previews. */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Signed so a 👍/👎 link can only vote on the digest it was sent with. The key is derived from the
// server's Supabase secret, so no extra secret has to be configured.
function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", secret).update("ask-a-trend feedback links").digest();
}

const sign = (digestId: string, itemKey: string, vote: 1 | -1) =>
  createHmac("sha256", key()).update(`${digestId}|${itemKey}|${vote}`).digest("base64url").slice(0, 22);

export function verifyVote(digestId: string, itemKey: string, vote: 1 | -1, sig: string): boolean {
  const want = Buffer.from(sign(digestId, itemKey, vote));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function voteUrl(digestId: string, itemKey: string, vote: 1 | -1): string {
  const q = new URLSearchParams({ d: digestId, k: itemKey, v: String(vote), s: sign(digestId, itemKey, vote) });
  return `${siteUrl()}/feedback?${q}`;
}

export const digestUrl = (digestId: string) => `${siteUrl()}/digests/${digestId}`;
