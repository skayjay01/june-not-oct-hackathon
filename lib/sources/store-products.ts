import type { TrendItem } from "@/lib/contracts";
import { loadTaggerVocab, readCsv } from "./curation";
import { fetchShopifyProducts, type StoreProduct } from "./shopify";
import { makeTagger, type Tags } from "./tagger";

// Connector "shopify_products" (US-003): new arrivals from the stores in Blair's stores.csv
// that have a public product list. Each product is tagged with vocabulary ids and scored with
// two library-wide signals the matcher ranks on:
//   growth       new listings in the last 30 days vs. the 60 days before, per category + color,
//                counted only from stores whose fetched list reaches back 90 days (lists are newest
//                first, so a short list would make everything look new)
//   store_count  how many tracked stores carry that category + color
// No database access here, so it can be run and checked on its own.

export type TrendRow = Omit<TrendItem, "id">;

export type StoreReport = { store: string; fetched: number; kept: number; error?: string };

const DAY = 86_400_000;
const MIN_LISTINGS = 5;

type Tagged = StoreProduct & { store: string; host: string; currency: string; styleTags: string[]; vocab: Tags };

const simple = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export async function collectStoreProducts({
  pages = 4,
  perStore = 80,
  // Shopify rate-limits per visitor across all its shops, so keep the total pace low.
  concurrency = 2,
  now = new Date(),
  only,
}: { pages?: number; perStore?: number; concurrency?: number; now?: Date; only?: string[] } = {}): Promise<{ rows: TrendRow[]; report: StoreReport[] }> {
  const [stores, vocab] = await Promise.all([readCsv("stores.csv"), loadTaggerVocab()]);
  const tag = makeTagger(vocab);
  const open = stores.filter((s) => s.public_product_list === "yes" && (!only || only.includes(s.store)));

  const report: StoreReport[] = [];
  const perStoreItems = await pool(open, concurrency, async (s) => {
    const { products, error } = await fetchShopifyProducts(s.url, { pages });
    // Stores that also resell other labels (e.g. Kith): keep the store's own products when it names itself as vendor.
    const own = products.filter((p) => simple(p.vendor).includes(simple(s.store)) || simple(s.store).includes(simple(p.vendor) || "-"));
    const mine = own.length ? own : products;
    const styleTags = s.style_tags.split(";").map((t) => t.trim()).filter((t) => vocab.styleTagIds.has(t));
    const tagged: Tagged[] = mine
      .map((p) => ({
        ...p,
        store: s.store,
        host: new URL(s.url).host.replace(/^www\./, ""),
        currency: s.currency_guess || "USD",
        styleTags,
        vocab: tag({ title: p.title, productType: p.productType, colorValues: p.colorValues, description: p.description.slice(0, 600) }),
      }))
      .filter((p) => p.vocab.category); // outside Blair's categories (watches, gift cards, homeware…)
    report.push({ store: s.store, fetched: products.length, kept: Math.min(tagged.length, perStore), ...(error && !products.length ? { error } : {}) });
    return tagged;
  });

  // Library-wide signals, computed over every tagged product (not only the ones kept).
  const all = perStoreItems.flat();
  const key = (p: Tagged) => `${p.vocab.category}|${p.vocab.colors[0] ?? "-"}`;
  const ageOf = (p: Tagged) => (p.publishedAt ? (now.getTime() - new Date(p.publishedAt).getTime()) / DAY : Infinity);
  const coversWindow = new Set(
    perStoreItems.filter((items) => items.some((p) => ageOf(p) > 90 && ageOf(p) !== Infinity)).map((items) => items[0].store),
  );
  const stats = new Map<string, { recent: number; prior: number; stores: Set<string> }>();
  for (const p of all) {
    const s = stats.get(key(p)) ?? { recent: 0, prior: 0, stores: new Set<string>() };
    s.stores.add(p.store);
    if (coversWindow.has(p.store)) {
      const age = ageOf(p);
      if (age <= 30) s.recent++;
      else if (age <= 90) s.prior++;
    }
    stats.set(key(p), s);
  }
  // Smoothed (+1 on both sides) and only with enough listings, so one store's drop doesn't read as +300%.
  const growthOf = (s: { recent: number; prior: number }) => {
    if (s.recent + s.prior < MIN_LISTINGS) return null;
    const g = (s.recent + 1) / (s.prior / 2 + 1) - 1; // prior is 60 days; compare per 30 days
    return Math.max(-1, Math.min(3, Math.round(g * 100) / 100));
  };

  const collectedAt = now.toISOString();
  const rows = perStoreItems.flatMap((items) =>
    items
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, perStore)
      .map((p): TrendRow => {
        const s = stats.get(key(p))!;
        const growth = growthOf(s);
        return {
          source: "shopify_products",
          source_item_id: `${p.host}:${p.id}`,
          brand_id: null,
          type: "product",
          title: p.title,
          category: p.vocab.category,
          attributes: {
            colors: p.vocab.colors,
            ...(p.vocab.silhouette ? { silhouette: p.vocab.silhouette } : {}),
            ...(p.vocab.material ? { material: p.vocab.material } : {}),
            ...(p.vocab.pattern ? { pattern: p.vocab.pattern } : {}),
            style_tags: p.styleTags,
          },
          price: p.price,
          currency: p.currency,
          image_url: p.imageUrl,
          link: p.url,
          metrics: { ...(growth === null ? {} : { growth }), store_count: s.stores.size },
          published_at: p.publishedAt,
          collected_at: collectedAt,
        };
      }),
  );
  return { rows, report: report.sort((a, b) => a.store.localeCompare(b.store)) };
}
