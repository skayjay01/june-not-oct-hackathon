import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";
import { db } from "@/lib/db/server";
import { politeFetch } from "@/lib/sources/crawler";
import { fetchShopifyProducts } from "@/lib/sources/shopify";

// Pictures on the brand page: the brand's own product photos (or its home page's share image),
// and other stores' products from the trend library that share the profile's style tags.
// Display only; the profiler still reads words, never images (FR-1).

type Pic = { src: string; alt: string; link: string | null; caption?: string };

const OWN = 6;
const SIMILAR = 8;

async function ownPictures(websiteUrl: string): Promise<Pic[]> {
  "use cache";
  cacheLife("hours");
  const { products } = await fetchShopifyProducts(websiteUrl);
  const pics = products
    .filter((p) => p.imageUrl)
    .slice(0, OWN)
    .map((p) => ({ src: p.imageUrl!, alt: p.title, link: p.url }));
  if (pics.length) return pics;

  // Not a Shopify store (or it hides its catalogue): fall back to the image the site shares on social.
  const home = await politeFetch(websiteUrl);
  if (!home.ok) return [];
  const $ = cheerio.load(home.body);
  const og = $('meta[property="og:image"], meta[name="twitter:image"]').first().attr("content");
  if (!og) return [];
  try {
    return [{ src: new URL(og, home.url).toString(), alt: "", link: home.url }];
  } catch {
    return [];
  }
}

async function similarPictures(styleTags: string[], ownHost: string): Promise<Pic[]> {
  if (!styleTags.length) return [];
  const { data } = await db()
    .from("trend_items")
    .select("title, image_url, link, source_item_id")
    .eq("type", "product")
    .is("brand_id", null)
    .not("image_url", "is", null)
    .or(styleTags.map((t) => `attributes.cs.${JSON.stringify({ style_tags: [t] })}`).join(","))
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);

  // One or two per store, so the strip shows a range of brands rather than one shop's catalogue.
  const perStore = new Map<string, number>();
  const pics: Pic[] = [];
  for (const r of data ?? []) {
    const store = r.source_item_id.split(":")[0].replace(/^www\./, "");
    if (store === ownHost || (perStore.get(store) ?? 0) >= 2) continue;
    perStore.set(store, (perStore.get(store) ?? 0) + 1);
    pics.push({ src: r.image_url!, alt: r.title ?? "", link: r.link, caption: store });
    if (pics.length === SIMILAR) break;
  }
  return pics;
}

export async function OwnGallery({ websiteUrl }: { websiteUrl: string }) {
  const pics = await ownPictures(websiteUrl);
  if (!pics.length) return null;
  return (
    <div className={`grid gap-2 ${pics.length === 1 ? "grid-cols-1" : "grid-cols-3 sm:grid-cols-6"}`}>
      {pics.map((p) => (
        <a key={p.src} href={p.link ?? undefined} target="_blank" rel="noreferrer" title={p.alt}>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote store images on many hosts */}
          <img
            src={p.src}
            alt={p.alt}
            loading="lazy"
            className={`w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800 ${pics.length === 1 ? "aspect-[2/1]" : "aspect-[4/5]"}`}
          />
        </a>
      ))}
    </div>
  );
}

export async function SimilarGallery({ styleTags, websiteUrl }: { styleTags: string[]; websiteUrl: string }) {
  const pics = await similarPictures(styleTags, new URL(websiteUrl).hostname.replace(/^www\./, ""));
  if (!pics.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Looks in your style</h2>
        <p className="text-sm text-zinc-500">Recent products from other stores tagged with your style. Tap one to see it in its shop.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pics.map((p) => (
          <a key={p.src} href={p.link ?? undefined} target="_blank" rel="noreferrer" className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote store images on many hosts */}
            <img src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/5] w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
            <span className="truncate text-xs text-zinc-500">{p.caption}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
