import { politeFetch } from "./crawler";
import { extractPage, findAboutLinks } from "./extract";
import { fetchShopifyProducts } from "./shopify";

// Reads the text of a brand's own public site: home page, About pages, product text, alt text.
// No database access here, so it can be run and tested on its own.

export type CrawlKind = "about" | "product" | "alt" | "ig_bio" | "ig_caption" | "other";

export type CrawledPage = { url: string; kind: CrawlKind; text: string };

export type BrandCrawl = { pages: CrawledPage[]; skipped: { url: string; reason: string }[] };

const MAX_ABOUT_PAGES = 3;
const MAX_PRODUCTS = 250;

export async function collectBrandPages(websiteUrl: string, extraUrls: string[] = []): Promise<BrandCrawl> {
  const pages: CrawledPage[] = [];
  const skipped: BrandCrawl["skipped"] = [];

  const home = await politeFetch(websiteUrl);
  let aboutUrls: string[] = [];
  if (home.ok) {
    const page = extractPage(home.body, home.url);
    pages.push({ url: home.url, kind: "other", text: [page.title, page.text].filter(Boolean).join("\n") });
    if (page.alts.length) pages.push({ url: home.url, kind: "alt", text: page.alts.join("\n") });
    aboutUrls = findAboutLinks(page.links, home.url).slice(0, MAX_ABOUT_PAGES);
  } else {
    skipped.push({ url: websiteUrl, reason: home.reason });
  }

  for (const url of [...aboutUrls, ...extraUrls]) {
    const res = await politeFetch(url);
    if (!res.ok) {
      skipped.push({ url, reason: res.reason });
      continue;
    }
    const page = extractPage(res.body, res.url);
    pages.push({ url: res.url, kind: aboutUrls.includes(url) ? "about" : "other", text: page.text });
    if (page.alts.length) pages.push({ url: res.url, kind: "alt", text: page.alts.join("\n") });
  }

  const { products, error } = await fetchShopifyProducts(websiteUrl);
  if (error) skipped.push({ url: new URL("/products.json", websiteUrl).toString(), reason: error });
  for (const p of products.slice(0, MAX_PRODUCTS)) {
    const text = [
      p.title,
      p.productType && `Type: ${p.productType}`,
      p.tags.length ? `Tags: ${p.tags.join(", ")}` : "",
      p.price != null ? `Price: ${p.price}` : "",
      p.description,
    ]
      .filter(Boolean)
      .join("\n");
    pages.push({ url: p.url, kind: "product", text });
    if (p.imageAlts.length) pages.push({ url: p.url, kind: "alt", text: p.imageAlts.join("\n") });
  }

  return { pages: pages.filter((p) => p.text.trim().length > 0), skipped };
}
