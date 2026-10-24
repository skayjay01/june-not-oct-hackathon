import type { DashboardSpec } from "@/lib/contracts";
import { engine } from "@/lib/engine";

// Streams the engine's DashboardEvents as newline-delimited JSON, so widgets appear one by one (US-005).
// Body: { brandId, question, previous? } — `previous` makes it a follow-up (US-009).
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTION = 500; // FR-11

export async function POST(req: Request) {
  let body: { brandId?: unknown; question?: unknown; previous?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!UUID.test(brandId)) return Response.json({ error: "Pick a brand first." }, { status: 400 });
  if (!question || question.length > MAX_QUESTION) {
    return Response.json({ error: `Ask a question of up to ${MAX_QUESTION} characters.` }, { status: 400 });
  }
  const previous = body.previous && typeof body.previous === "object" ? (body.previous as DashboardSpec) : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of engine.answerQuestion(brandId, question, previous)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (e) {
        console.error("[ask]", e);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: "Something went wrong building this dashboard. Please try again." }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
