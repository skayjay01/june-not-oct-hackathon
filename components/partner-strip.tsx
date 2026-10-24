import { db } from "@/lib/db/server";

// "In partnership with": a name badge for every free trend source that is switched on, in our own
// type styles rather than the organisations' logos. The brand's own site isn't a partner, so it's left out.

type Badge = { name: string; note: string; look: keyof typeof LOOKS };

const LOOKS = {
  serif: "font-serif text-lg italic",
  bold: "text-lg font-bold tracking-tight",
  caps: "text-sm font-semibold uppercase tracking-[0.2em]",
  light: "text-lg font-light tracking-wide",
};

const BADGES: Record<string, Badge[]> = {
  google_trends: [{ name: "Google Trends", note: "Search interest", look: "bold" }],
  wikipedia_pageviews: [{ name: "Wikipedia", note: "What people read", look: "serif" }],
  announced_colors: [
    { name: "Pantone", note: "Color of the year", look: "caps" },
    { name: "WGSN", note: "Key colors", look: "caps" },
    { name: "Coloro", note: "Key colors", look: "light" },
  ],
  shopify_products: [{ name: "Shopify", note: "Store new arrivals", look: "bold" }],
  pinterest_trends: [{ name: "Pinterest", note: "Trending searches", look: "bold" }],
  met_museum: [{ name: "The Met", note: "Costume Institute", look: "serif" }],
  vam_museum: [{ name: "V&A", note: "Fashion archive", look: "caps" }],
  art_institute_chicago: [{ name: "Art Institute of Chicago", note: "Textiles", look: "light" }],
  cleveland_museum: [{ name: "Cleveland Museum of Art", note: "Textiles", look: "serif" }],
  europeana: [{ name: "Europeana", note: "European fashion archives", look: "light" }],
  smithsonian: [{ name: "Smithsonian", note: "Incl. Cooper Hewitt", look: "caps" }],
  cooper_hewitt: [{ name: "Cooper Hewitt", note: "Design museum", look: "caps" }],
};

export async function PartnerStrip() {
  const { data } = await db().from("sources").select("key, name").eq("enabled", true).eq("licensed", false).order("key");
  const badges = (data ?? [])
    .filter((s) => s.key !== "brand_site")
    .flatMap((s) => BADGES[s.key] ?? [{ name: s.name, note: "Trend data", look: "bold" as const }]);
  if (!badges.length) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">In partnership with</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {badges.map((b) => (
          <li
            key={b.name}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-200 px-3 py-3 text-center dark:border-zinc-800"
          >
            <span className={`${LOOKS[b.look]} text-zinc-900 dark:text-zinc-100`}>{b.name}</span>
            <span className="text-xs text-zinc-500">{b.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
