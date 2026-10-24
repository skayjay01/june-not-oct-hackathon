// Self-check for onboarding's brand finder. No network or AI: search and pages are faked.
// Run: npx tsx lib/engine/brand-finder.check.mts  (exits 1 on any problem)

import { findBrandPresence, siteRoot, socialFromUrl, socialLink, socialsFromHtml, type FinderDeps, type HomePage, type SearchAnswer } from "./brand-finder";

let bad = 0;
const expect = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  if (!ok) bad++;
};

// 1. Reading links
expect("links: profile links → platform + handle", JSON.stringify(["https://www.instagram.com/damsonmadder/", "https://www.tiktok.com/@paloma_wool", "https://uk.pinterest.com/rouje_paris/", "https://twitter.com/brand", "https://www.youtube.com/channel/UCRYsjNkL8ylJkH178_cVvug"].map((u) => socialFromUrl(u)?.handle)) === JSON.stringify(["damsonmadder", "paloma_wool", "rouje_paris", "brand", "UCRYsjNkL8ylJkH178_cVvug"]));
expect("links: youtube channel id keeps a working link", socialFromUrl("https://www.youtube.com/channel/UCRYsjNkL8ylJkH178_cVvug")?.url === "https://www.youtube.com/channel/UCRYsjNkL8ylJkH178_cVvug");
const notAccounts = ["https://www.facebook.com/sharer/sharer.php?u=x", "https://www.facebook.com/tr?id=1", "https://twitter.com/intent/tweet?text=x", "https://pinterest.com/pin/create/button/?url=x", "https://www.instagram.com/p/Cx123/", "https://www.youtube.com/watch?v=abc", "https://www.tiktok.com/embed.js", "https://example.com/instagram"];
expect("links: share buttons, posts, pixels and other sites are not accounts", notAccounts.every((u) => socialFromUrl(u) === null), notAccounts.filter((u) => socialFromUrl(u)).join(", "));
expect("typed: @handle, bare handle and a link all become the profile link", socialLink("instagram", "@brand") === "https://www.instagram.com/brand/" && socialLink("tiktok", "brand") === "https://www.tiktok.com/@brand" && socialLink("instagram", "instagram.com/brand") === "https://www.instagram.com/brand/");
expect("typed: a link to the wrong site or nonsense is refused", socialLink("instagram", "https://www.tiktok.com/@brand") === null && socialLink("instagram", "my brand!!") === null);
expect("site address: trimmed to the home page", siteRoot("damsonmadder.com/en-us?ref=x") === "https://damsonmadder.com" && siteRoot("not a site") === null);

// 2. A homepage footer: the brand's own accounts, not the payment provider's or a share button
const footer = `<footer><a href="https://www.instagram.com/damsonmadder/">IG</a><a href="https://www.instagram.com/shopify/">Powered by</a>
  <a href="https://www.instagram.com/damsonmadder">IG again</a><a href="https:\\/\\/www.tiktok.com\\/@damsonmadder">TikTok</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=https://damsonmadder.com">Share</a></footer>`;
const fs = socialsFromHtml(footer, "Damson Madder");
expect("footer: brand-named account wins over another account on the same platform", fs.instagram?.handle === "damsonmadder", JSON.stringify(fs));
expect("footer: escaped links in page scripts are read; share buttons are not", fs.tiktok?.handle === "damsonmadder" && !fs.facebook, JSON.stringify(fs));

// 3. Whole lookups with fake search + pages
const page = (url: string, title: string, body = "", status = 200): HomePage => ({ status, url, html: `<html><head><title>${title}</title></head><body>${body}</body></html>` });
const fake = (answer: SearchAnswer | null, pages: Record<string, HomePage>) => {
  const calls = { search: 0, fetched: [] as string[] };
  const deps: FinderDeps = {
    search: async () => (calls.search++, answer),
    fetchHome: async (u) => (calls.fetched.push(u), pages[u] ?? null),
  };
  return { deps, calls };
};
const answer = (o: Partial<SearchAnswer>): SearchAnswer => ({ name: null, website: null, description: null, socials: {}, alternatives: [], ...o });

const dm = fake(answer({ name: "Damson Madder", website: "https://damsonmadder.com/en-us", description: "London womenswear.", socials: { instagram: "https://www.instagram.com/wrongaccount/", pinterest: "https://www.pinterest.com/damsonmadder/" }, alternatives: [{ name: "Damson Madder", website: "https://damsonmadder.com" }, { name: "Damson Dresses", website: "damsondresses.co.uk" }] }), {
  "https://damsonmadder.com": page("https://damsonmadder.com/en-us", "Damson Madder", footer),
});
const r1 = await findBrandPresence("Damson Madder", dm.deps);
expect("found: website from search, opened and confirmed as theirs", r1.website === "https://damsonmadder.com" && r1.website_source === "search" && r1.website_checked && !r1.website_blocked, JSON.stringify(r1));
expect("found: the site's own footer beats the search's guess", r1.socials.instagram?.handle === "damsonmadder" && r1.socials.instagram.source === "site", JSON.stringify(r1.socials));
expect("found: search fills platforms the site doesn't link, marked to confirm", r1.socials.pinterest?.source === "search" && r1.socials.tiktok?.source === "site", JSON.stringify(r1.socials));
expect("found: 'Not you?' never offers the brand we picked", r1.alternatives.length === 1 && r1.alternatives[0].website === "https://damsondresses.co.uk", JSON.stringify(r1.alternatives));

const cos = fake(answer({ name: "COS", website: "https://www.cos.com", socials: { instagram: "@cosstores" } }), { "https://www.cos.com": page("https://www.cos.com/", "Access Denied", "", 403) });
const r2 = await findBrandPresence("cos", cos.deps);
expect("blocked site: kept, flagged blocked and unchecked; accounts come from search", r2.website === "https://www.cos.com" && r2.website_blocked && !r2.website_checked && r2.socials.instagram?.handle === "cosstores" && r2.socials.instagram.source === "search", JSON.stringify(r2));
expect("name: lower-case typing takes the brand's own spelling", r2.name === "COS");
expect("name: the founder's capitalised spelling is kept", (await findBrandPresence("Paloma Wool", fake(answer({ name: "paloma wool" }), {}).deps)).name === "Paloma Wool");

const nobody = fake(answer({}), { "https://www.zzqx.com": page("https://www.zzqx.com", "Parked domain for sale") });
const r3 = await findBrandPresence("Zzqx", nobody.deps);
expect("not found: nothing invented, so the form asks for it", r3.website === null && Object.keys(r3.socials).length === 0 && r3.website_source === null, JSON.stringify(r3));

const down = fake(null, { "https://www.palomawool.com": page("https://palomawool.com/", "Paloma Wool", footer.replace(/damsonmadder/g, "palomawool")) });
const r4 = await findBrandPresence("Paloma Wool", down.deps);
expect("AI down: the obvious address is tried and kept only because it is clearly theirs", r4.website === "https://www.palomawool.com" && r4.website_checked && r4.socials.instagram?.handle === "palomawool", JSON.stringify(r4));

const parked = await findBrandPresence("Zzqx", fake(null, { "https://www.zzqx.com": page("https://www.zzqx.com", "Domain for sale") }).deps);
expect("AI down: a parked address that matches the name is not kept", parked.website === null, JSON.stringify(parked));

const given = fake(answer({ website: "https://other.com" }), { "https://rouje.com": page("https://www.rouje.com/", "Rouje | Paris", footer.replace(/damsonmadder/g, "rouje")) });
const r5 = await findBrandPresence("Rouje", given.deps, "rouje.com");
expect("founder gave the site and it lists accounts: no web search, founder's site kept", given.calls.search === 0 && r5.website === "https://rouje.com" && r5.website_source === "you" && r5.website_checked && r5.socials.instagram?.handle === "rouje", JSON.stringify({ r5, calls: given.calls }));

const quiet = fake(answer({ socials: { tiktok: "https://www.tiktok.com/@quietbrand" } }), { "https://quietbrand.com": page("https://quietbrand.com/", "Quiet Brand") });
const r6 = await findBrandPresence("Quiet Brand", quiet.deps, "quietbrand.com");
expect("founder gave a site with no account links: search fills them in", quiet.calls.search === 1 && r6.socials.tiktok?.handle === "quietbrand" && r6.website === "https://quietbrand.com", JSON.stringify(r6));

process.exit(bad ? 1 : 0);
