import * as cheerio from "cheerio";
import { cacheLife } from "next/cache";
import { politeFetch } from "@/lib/sources/crawler";
import { fetchShopifyProducts } from "@/lib/sources/shopify";

// Pictures on the brand page, all taken from the brand's own official website: its product photos,
// or, when the site has no public catalogue, the images on its home page.
// Display only; the profiler still reads words, never images (FR-1).

type Pic = { src: string; alt: string; link: string | null };

const OWN = 6;
const MORE = 8;

// Home-page images that are logos, icons, payment badges or tracking pixels, not photos.
const NOT_A_PHOTO = /logo|icon|sprite|favicon|badge|payment|pixel|placeholder|\.svg(\?|$)|\.gif(\?|$)/i;

async function sitePictures(websiteUrl: string): Promise<Pic[]> {
  "use cache";
  cacheLife("hours");
  const { products } = await fetchShopifyProducts(websiteUrl);
  const pics = products
    .filter((p) => p.imageUrl)
    .slice(0, OWN + MORE)
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
    if (out.length === OWN + MORE) break;
  }
  return out;
}

export async function OwnGallery({ websiteUrl }: { websiteUrl: string }) {
  const pics = (await sitePictures(websiteUrl)).slice(0, OWN);
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

export async function MoreGallery({ websiteUrl }: { websiteUrl: string }) {
  const pics = (await sitePictures(websiteUrl)).slice(OWN);
  if (!pics.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">More from your website</h2>
        <p className="text-sm text-zinc-500">
          Photos from {new URL(websiteUrl).hostname.replace(/^www\./, "")}. Tap one to open it on your site.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pics.map((p) => (
          <a key={p.src} href={p.link ?? undefined} target="_blank" rel="noreferrer" title={p.alt}>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote store images on many hosts */}
            <img src={p.src} alt={p.alt} loading="lazy" className="aspect-[4/5] w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
          </a>
        ))}
      </div>
    </div>
  );
}
