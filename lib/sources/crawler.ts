import robotsParser from "robots-parser";

// Polite fetch for every connector (PRD §7.3): honest user agent, robots.txt respected,
// at most one request per second per host (or the site's Crawl-delay), public pages only.

export const USER_AGENT =
  "AskATrendBot/0.1 (+https://june-not-oct-hackathon.vercel.app; trend research for small brands)";

const MIN_DELAY_MS = 1000;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3_000_000;

type Robots = ReturnType<typeof robotsParser>;

const robotsCache = new Map<string, Promise<Robots>>();
const nextSlot = new Map<string, number>();

export type FetchResult =
  | { ok: true; url: string; status: number; contentType: string; body: string }
  | { ok: false; url: string; reason: string };

async function robotsFor(origin: string): Promise<Robots> {
  let robots = robotsCache.get(origin);
  if (!robots) {
    const robotsUrl = `${origin}/robots.txt`;
    robots = rawFetch(robotsUrl)
      .then((r) => robotsParser(robotsUrl, r.ok && r.status === 200 ? r.body : ""))
      .catch(() => robotsParser(robotsUrl, ""));
    robotsCache.set(origin, robots);
  }
  return robots;
}

// Reserve the next free time slot for this host, then wait for it.
async function waitTurn(host: string, delayMs: number) {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + delayMs);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function rawFetch(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
    redirect: "follow",
    credentials: "omit",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.text();
  if (body.length > MAX_BYTES) return { ok: false, url, reason: "response too large" };
  return {
    ok: true,
    url: res.url || url,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body,
  };
}

export async function politeFetch(url: string): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, reason: "invalid url" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, url, reason: "unsupported protocol" };
  }

  const robots = await robotsFor(parsed.origin);
  if (robots.isDisallowed(url, USER_AGENT)) return { ok: false, url, reason: "disallowed by robots.txt" };

  const crawlDelayMs = (robots.getCrawlDelay(USER_AGENT) ?? 0) * 1000;
  await waitTurn(parsed.host, Math.max(MIN_DELAY_MS, crawlDelayMs));

  try {
    const res = await rawFetch(url);
    if (!res.ok) return res;
    // Logins, paywalls and anti-bot challenges are a hard stop, never something to get around.
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      return { ok: false, url, reason: `blocked (HTTP ${res.status})` };
    }
    if (res.status >= 400) return { ok: false, url, reason: `HTTP ${res.status}` };
    return res;
  } catch (e) {
    return { ok: false, url, reason: e instanceof Error ? e.message : String(e) };
  }
}
