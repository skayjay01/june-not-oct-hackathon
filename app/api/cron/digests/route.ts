import { sendDueDigests } from "@/lib/delivery/schedule";

// Called by Vercel cron (needs a vercel.json entry, Yishan's call). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; without CRON_SECRET set, the route refuses everything.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json({ results: await sendDueDigests() });
}
