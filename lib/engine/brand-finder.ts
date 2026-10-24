// Onboarding: find a brand's website and social accounts from its name, so the founder only
// fills in what we couldn't find. A web search proposes; the brand's own homepage confirms
// (its footer links are the brand's word on which accounts are official).
// Pure: the search and the page fetch come in as deps, so the check file runs without network.

import { SOCIAL_PLATFORMS, type BrandPresence, type FoundSource, type SocialPlatform } from "@/lib/contracts";

export type SearchAnswer = {
  name: string | null;
  website: string | null;
  description: string | null;
  socials: Partial<Record<SocialPlatform, string | null>>;
  alternatives: { name: string; website: string }[];
};

/** null = the page could not be reached at all */
export type HomePage = { status: number; url: string; html: string } | null;

export type FinderDeps = {
  /** null when search is unavailable (AI down) */
  search: (name: string, website?: string) => Promise<SearchAnswer | null>;
  fetchHome: (url: string) => Promise<HomePage>;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** "yourbrand.com/en-us?x" → "https://yourbrand.com"; null if it isn't a web address. */
export function siteRoot(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return `https://${u.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

const RESERVED: Record<SocialPlatform, Set<string>> = {
  instagram: new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "share", "direct"]),
  tiktok: new Set([]),
  pinterest: new Set(["pin", "search", "ideas", "_", "sharer", "share", "explore", "today", "business"]),
  facebook: new Set(["sharer", "sharer.php", "share", "share.php", "tr", "dialog", "plugins", "pages", "groups", "profile.php", "events", "watch", "login", "help", "policies"]),
  x: new Set(["intent", "share", "home", "search", "hashtag", "i", "login", "explore"]),
  youtube: new Set(["watch", "embed", "shorts", "results", "playlist", "feed", "redirect"]),
};
const HANDLE = /^[a-z0-9._-]{1,50}$/i;

function platformOf(host: string): SocialPlatform | null {
  const h = host.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (h === "instagram.com" || h === "instagr.am") return "instagram";
  if (h === "tiktok.com") return "tiktok";
  if (/(^|\.)pinterest\.[a-z.]+$/.test(h)) return "pinterest";
  if (h === "facebook.com" || h === "fb.com") return "facebook";
  if (h === "x.com" || h === "twitter.com") return "x";
  if (h === "youtube.com") return "youtube";
  return null;
}

export function profileUrl(platform: SocialPlatform, handle: string): string {
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "pinterest":
      return `https://www.pinterest.com/${handle}/`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "youtube":
      // channel ids (UC + 22 characters) have no @ address
      return /^UC[\w-]{22}$/.test(handle) ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/@${handle}`;
  }
}

/** A link to a brand's own profile → its platform and handle; share buttons, posts and pixels → null. */
export function socialFromUrl(raw: string): { platform: SocialPlatform; handle: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^\/\//, "https://"));
  } catch {
    return null;
  }
  const platform = platformOf(u.hostname);
  if (!platform) return null;
  const segs = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let handle: string | undefined;
  if (platform === "tiktok") handle = segs[0]?.startsWith("@") ? segs[0].slice(1) : undefined;
  else if (platform === "youtube") handle = segs[0]?.startsWith("@") ? segs[0].slice(1) : ["c", "user", "channel"].includes(segs[0] ?? "") ? segs[1] : undefined;
  else handle = segs[0];
  if (!handle || RESERVED[platform].has(handle.toLowerCase()) || !HANDLE.test(handle)) return null;
  return { platform, handle, url: profileUrl(platform, handle) };
}

/** What a founder typed for one platform ("@brand", "brand", or a link) → the profile link; null if unusable. */
export function socialLink(platform: SocialPlatform, raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/[/.]/.test(s) && /^(https?:\/\/|www\.|[a-z.]*\.(com|am)\/)/i.test(s)) {
    const found = socialFromUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return found?.platform === platform ? found.url : null;
  }
  const handle = s.replace(/^@/, "");
  return HANDLE.test(handle) ? profileUrl(platform, handle) : null;
}

/** The brand's own accounts linked from its homepage; when a platform has several, the one named like the brand wins, then the most linked. */
export function socialsFromHtml(html: string, brandName: string): Partial<Record<SocialPlatform, { url: string; handle: string }>> {
  const text = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const counts = new Map<string, { platform: SocialPlatform; handle: string; url: string; n: number }>();
  for (const m of text.matchAll(/(?:https?:)?\/\/[a-z0-9.-]*(?:instagram\.com|instagr\.am|tiktok\.com|pinterest\.[a-z.]+|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com)\/[^"'\s<>\\)]*/gi)) {
    const s = socialFromUrl(m[0]);
    if (!s) continue;
    const key = `${s.platform}:${s.handle.toLowerCase()}`;
    const prev = counts.get(key);
    counts.set(key, prev ? { ...prev, n: prev.n + 1 } : { ...s, n: 1 });
  }
  const want = slug(brandName);
  const like = (h: string) => {
    const t = slug(h);
    return t.length >= 3 && (t.includes(want) || want.includes(t)) ? 1 : 0;
  };
  const out: Partial<Record<SocialPlatform, { url: string; handle: string }>> = {};
  for (const p of SOCIAL_PLATFORMS) {
    const best = [...counts.values()].filter((c) => c.platform === p).sort((a, b) => like(b.handle) - like(a.handle) || b.n - a.n)[0];
    if (best) out[p] = { url: best.url, handle: best.handle };
  }
  return out;
}

const titleOf = (html: string) => (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").replace(/&[a-z#0-9]+;/gi, " ").trim();
const metaDescription = (html: string) =>
  html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']{10,300})["']/i)?.[1]?.replace(/&[a-z#0-9]+;/gi, " ").trim() ?? null;

/** Bot walls: refused outright, or a "checking your browser" page instead of the store. */
export function isBlocked(page: HomePage): boolean {
  if (!page) return false;
  return [401, 403, 429, 503].includes(page.status) || /access denied|just a moment|attention required|are you a robot|captcha/i.test(titleOf(page.html));
}

/** The page is this brand's: its name is in the address or the page title. */
export function isBrandsPage(page: HomePage, brandName: string): boolean {
  if (!page || page.status >= 400 || isBlocked(page)) return false;
  const want = slug(brandName);
  if (want.length < 2) return false;
  let host = "";
  try {
    host = slug(new URL(page.url).hostname.replace(/^www\./, "").split(".").slice(0, -1).join(""));
  } catch {
    // keep host empty
  }
  return host.includes(want) || (host.length >= 4 && want.includes(host)) || slug(titleOf(page.html)).includes(want);
}

export async function findBrandPresence(rawName: string, deps: FinderDeps, rawWebsite?: string): Promise<BrandPresence> {
  const name = rawName.trim();
  const given = siteRoot(rawWebsite);
  let website = given;
  let source: FoundSource | null = given ? "you" : null;
  let home: HomePage = null;
  let siteSocials: ReturnType<typeof socialsFromHtml> = {};

  if (given) {
    home = await deps.fetchHome(given).catch(() => null);
    siteSocials = home && !isBlocked(home) ? socialsFromHtml(home.html, name) : {};
  }
  // The founder's own site already lists its accounts: no search needed.
  const needSearch = !given || Object.keys(siteSocials).length === 0;
  const search = needSearch ? await deps.search(name, given ?? undefined).catch(() => null) : null;

  if (!website) {
    const found = siteRoot(search?.website);
    if (found) {
      website = found;
      source = "search";
      home = await deps.fetchHome(found).catch(() => null);
    } else if (!search) {
      // Search is down: try the obvious address, and keep it only if its page is titled with the brand's
      // name (a matching address alone could be a parked domain or a different business).
      for (const guess of [`https://www.${slug(name)}.com`, `https://${slug(name)}.com`]) {
        const page = await deps.fetchHome(guess).catch(() => null);
        if (isBrandsPage(page, name) && slug(titleOf(page!.html)).includes(slug(name))) {
          website = guess;
          source = "site";
          home = page;
          break;
        }
      }
    }
    siteSocials = home && !isBlocked(home) && isBrandsPage(home, name) ? socialsFromHtml(home.html, name) : {};
  }

  const socials: BrandPresence["socials"] = {};
  for (const p of SOCIAL_PLATFORMS) {
    if (siteSocials[p]) socials[p] = { ...siteSocials[p]!, source: "site" };
    else {
      const raw = search?.socials?.[p];
      const url = raw ? socialLink(p, raw) : null;
      const s = url ? socialFromUrl(url) : null;
      if (s) socials[p] = { url: s.url, handle: s.handle, source: "search" };
    }
  }

  const host = website ? new URL(website).hostname.replace(/^www\./, "") : "";
  const alternatives = (search?.alternatives ?? [])
    .map((a) => ({ name: a.name.trim(), website: siteRoot(a.website) }))
    .filter((a): a is { name: string; website: string } => !!a.name && !!a.website && new URL(a.website).hostname.replace(/^www\./, "") !== host)
    .slice(0, 3);

  return {
    // the founder's spelling, unless they typed it all lower case and the brand writes it otherwise ("cos" → "COS")
    name: name !== name.toLowerCase() || !search?.name?.trim() ? name : search.name.trim(),
    website,
    website_source: website ? source : null,
    website_checked: isBrandsPage(home, name) || (source === "you" && !!home && home.status < 400 && !isBlocked(home)),
    website_blocked: isBlocked(home),
    socials,
    description: search?.description?.trim() || (home && !isBlocked(home) ? metaDescription(home.html) : null),
    alternatives,
  };
}
