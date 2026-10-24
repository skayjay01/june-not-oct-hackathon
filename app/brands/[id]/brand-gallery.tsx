import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";
import { politeFetch } from "@/lib/sources/crawler";
import { fetchShopifyProducts } from "@/lib/sources/shopify";

// A row of pictures under the brand name, all taken from the brand's own official website: its product photos,
// or, when the site has no public catalogue, the images on its home page.
// Display only; the profiler still reads words, never images (FR-1).

type Pic = { src: string; alt: string; link: string | null };

const OWN = 6;

// Home-page images that are logos, icons, payment badges or tracking pixels, not photos.
const NOT_A_PHOTO = /logo|icon|sprite|favicon|badge|payment|pixel|placeholder|\.svg(\?|$)|\.gif(\?|$)/i;

async function sitePictures(websiteUrl: string): Promise<Pic[]> {
  "use cache";
  cacheLife("hours");
  const { products } = await fetchShopifyProducts(websiteUrl);
  const pics = products
    .filter((p) => p.imageUrl)
    .slice(0, OWN)
    .map((p) => ({ src: p.imageUrl!, alt: p.title, link: p.url }));
  if (pics.length) return pics;

  // Not a Shopify store (or it hides its catalogue): use the share image and the photos on its home page.
  const home = await politeFetch(websiteUrl);
  if (!home.ok) return [];
  const $ = cheerio.load(home.body);
  const candidates = [
    $('meta[property="og:image"], meta[name="twitter:image"]').first().attr("content"),
    ...$("img")
      .toArray()
      .filter((el) => !(Number($(el).attr("width")) < 200))
      .map((el) => {
        const srcset = $(el).attr("srcset") ?? $(el).attr("data-srcset");
        const largest = srcset?.split(",").pop()?.trim().split(/\s+/)[0];
        return largest || $(el).attr("data-src") || $(el).attr("src");
      }),
  ];
  const seen = new Set<string>();
  const out: Pic[] = [];
  for (const c of candidates) {
    if (!c || c.startsWith("data:") || NOT_A_PHOTO.test(c)) continue;
    let src: string;
    try {
      src = new URL(c, home.url).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(src) || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: "", link: home.url });
    if (out.length === OWN) break;
  }
  return out;
}

export async function OwnGallery({ websiteUrl }: { websiteUrl: string }) {
  const pics = await sitePictures(websiteUrl);
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
