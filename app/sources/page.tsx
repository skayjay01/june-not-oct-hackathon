import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db/server";
import { setEnabled } from "./actions";
import { RunButton } from "./run-button";

// "Run now" collects from every enabled source inside the request.
export const maxDuration = 300;

export const metadata = { title: "Sources · Ask-a-Trend" };

type Source = { key: string; name: string; enabled: boolean; terms_notes: string | null; last_run_at: string | null; last_error: string | null };

export default function SourcesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Trend sources</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Where the trend library comes from. Switch a source off and it stops being collected; what&apos;s already
          collected stays.
        </p>
      </div>
      <RunButton />
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <SourceList />
      </Suspense>
      <Suspense fallback={null}>
        <LibrarySample />
      </Suspense>
    </main>
  );
}

async function SourceList() {
  await connection();
  const { data, error } = await db().from("sources").select("key, name, enabled, terms_notes, last_run_at, last_error").order("key");
  if (error) return <p className="text-red-700 dark:text-red-400">{error.message}</p>;
  const sources = data as Source[];
  const counts = await Promise.all(
    sources.map(async (s) => {
      const { count } = await db().from("trend_items").select("id", { count: "exact", head: true }).eq("source", s.key);
      return count ?? 0;
    }),
  );

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {sources.map((s, i) => (
        <li key={s.key} className="flex flex-col gap-1 py-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{s.name}</span>
            <form action={setEnabled.bind(null, s.key, !s.enabled)}>
              <button
                type="submit"
                aria-pressed={s.enabled}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  s.enabled ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {s.enabled ? "On" : "Off"}
              </button>
            </form>
          </div>
          <p className="text-sm text-zinc-500">
            {counts[i].toLocaleString()} items
            {s.last_run_at ? ` · last run ${new Date(s.last_run_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET` : " · never run"}
          </p>
          {s.last_error && <p className="text-sm text-amber-700 dark:text-amber-400">{s.last_error}</p>}
          {s.terms_notes && <p className="text-xs text-zinc-400">Terms: {s.terms_notes}</p>}
        </li>
      ))}
    </ul>
  );
}

type Sample = { id: number; title: string | null; category: string | null; attributes: { colors?: string[]; material?: string }; price: number | null; currency: string | null; link: string | null; metrics: { growth?: number; store_count?: number } };

// A quick look at how products were tagged, so anyone can sanity-check the library.
async function LibrarySample() {
  await connection();
  const { data, error } = await db()
    .from("trend_items")
    .select("id, title, category, attributes, price, currency, link, metrics")
    .eq("source", "shopify_products")
    .order("published_at", { ascending: false })
    .limit(1000);
  if (error || !data?.length) return null;
  const items = data as Sample[];
  const tally = (keys: (string | undefined)[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k ?? "—", (m.get(k ?? "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const pct = (n: number) => `${Math.round((n / items.length) * 100)}%`;
  return (
    <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-xl font-semibold">What&apos;s in the library</h2>
      <p className="text-sm text-zinc-500">
        Newest {items.length} store products: {pct(items.filter((i) => i.attributes.colors?.length).length)} have a color,{" "}
        {pct(items.filter((i) => i.attributes.material).length)} a material, {pct(items.filter((i) => typeof i.metrics.growth === "number").length)} a
        growth score.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["Categories", tally(items.map((i) => i.category ?? undefined))],
          ["First color", tally(items.map((i) => i.attributes.colors?.[0]))],
        ].map(([title, rows]) => (
          <div key={title as string}>
            <h3 className="mb-1 text-sm font-medium">{title as string}</h3>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400">
              {(rows as [string, number][]).map(([k, n]) => (
                <li key={k}>
                  {k} · {n}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="text-sm font-medium">Sample</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {items
          .filter((_, i) => i % Math.max(1, Math.floor(items.length / 25)) === 0)
          .map((i) => (
            <li key={i.id} className="text-zinc-600 dark:text-zinc-400">
              <a href={i.link ?? undefined} target="_blank" rel="noreferrer" className="text-zinc-900 hover:underline dark:text-zinc-100">
                {i.title}
              </a>{" "}
              · {i.category} · {i.attributes.colors?.join(", ") || "no color"}
              {i.attributes.material ? ` · ${i.attributes.material}` : ""} · {i.price} {i.currency}
              {typeof i.metrics.growth === "number" ? ` · growth ${Math.round(i.metrics.growth * 100)}%` : ""} · {i.metrics.store_count} stores
            </li>
          ))}
      </ul>
    </section>
  );
}
