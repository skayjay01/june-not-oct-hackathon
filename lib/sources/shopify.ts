import { politeFetch } from "./crawler";
import { htmlToText } from "./extract";

// Many Shopify stores publish their catalogue at /products.json (250 products per page).
// Used by crawlBrand (the brand's own store) and, in B3, the store-list connector.

export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string;
  tags: string[] | string;
  vendor: string;
  published_at: string | null;
  created_at: string;
  images: { src: string; alt: string | null }[];
  variants: { price: string }[];
  options?: { name: string; values: string[] }[];
};

export type StoreProduct = {
  id: string;
  url: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  colorValues: string[];
  tags: string[];
  imageUrl: string | null;
  imageAlts: string[];
  price: number | null;
  publishedAt: string | null;
};

// Stores often use tags for internal keys ("brand::cfId => …"); keep only human-readable ones.
function isStyleTag(t: string) {
  return t.length > 0 && t.length <= 40 && !/::|=>|^[a-z0-9_-]+:[^ ]/i.test(t);
}

export async function fetchShopifyProducts(
  storeUrl: string,
  { pages = 1 }: { pages?: number } = {},
): Promise<{ products: StoreProduct[]; error?: string }> {
  const origin = new URL(storeUrl).origin;
  const products: StoreProduct[] = [];
  for (let page = 1; page <= pages; page++) {
    const res = await politeFetch(`${origin}/products.json?limit=250&page=${page}`);
    if (!res.ok) return { products, error: res.reason };
    if (!res.contentType.includes("json")) return { products, error: "no public product list" };
    let data: { products?: ShopifyProduct[] };
    try {
      data = JSON.parse(res.body);
    } catch {
      return { products, error: "product list is not valid JSON" };
    }
    const batch = data.products ?? [];
    for (const p of batch) {
      const prices = p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
      products.push({
        id: String(p.id),
        url: `${origin}/products/${p.handle}`,
        title: p.title,
        description: htmlToText(p.body_html ?? ""),
        productType: p.product_type,
        vendor: p.vendor,
        colorValues: (p.options ?? []).filter((o) => /colou?r/i.test(o.name)).flatMap((o) => o.values),
        tags: (Array.isArray(p.tags) ? p.tags : p.tags.split(",")).map((t) => t.trim()).filter(isStyleTag),
        imageUrl: p.images[0]?.src ?? null,
        imageAlts: p.images.map((i) => i.alt ?? "").filter(Boolean),
        price: prices.length ? Math.min(...prices) : null,
        publishedAt: p.published_at,
      });
    }
    if (batch.length < 250) break;
  }
  return { products };
}
