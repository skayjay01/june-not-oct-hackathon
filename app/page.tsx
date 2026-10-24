import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db/server";

async function Brands() {
  await connection(); // read at request time, not baked in at build
  const { data, error } = await db()
    .from("brands")
    .select("id, name, website_url, crawl_status")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return <p className="text-red-700 dark:text-red-400">Couldn&apos;t load brands: {error.message}</p>;
  if (!data.length) return <p className="text-zinc-500">No brands yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {data.map((b) => (
        <li key={b.id}>
          <Link href={`/brands/${b.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:opacity-70">
            <span className="font-medium">{b.name}</span>
            <span className="truncate text-sm text-zinc-500">{b.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-16">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Ask-a-Trend</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          An AI trend scout for small fashion brands. It learns your style from your website, then sends you on-trend
          ideas that fit it.
        </p>
        <Link
          href="/onboard"
          className="inline-flex h-10 items-center self-start rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add your brand
        </Link>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Brands</h2>
        <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
          <Brands />
        </Suspense>
      </section>
    </main>
  );
}
