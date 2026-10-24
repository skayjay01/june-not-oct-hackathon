import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/lib/db/server";
import { inputClass } from "@/components/form";
import { brandsWithProfiles, exampleQuestions } from "./ask/data";

// The home screen's question box (US-005): a plain GET form to /ask, which streams the dashboard.
async function QuestionBox() {
  await connection();
  const [brands, examples] = await Promise.all([brandsWithProfiles(), exampleQuestions()]);
  if (!brands.length) return null;
  return (
    <form action="/ask" className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <label htmlFor="q" className="font-medium">
        Ask a trend question
      </label>
      <textarea id="q" name="q" rows={2} maxLength={500} required placeholder="Which colors are rising in summer dresses under $50?" className={`${inputClass} text-lg`} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="brand" aria-label="For which brand" className={`${inputClass} w-auto py-1.5 text-sm`}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
          Ask
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {examples.map((ex) => (
          <li key={ex}>
            <Link href={`/ask?${new URLSearchParams({ q: ex, brand: brands[0].id })}`} className="block rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-zinc-500 dark:border-zinc-700">
              {ex}
            </Link>
          </li>
        ))}
      </ul>
    </form>
  );
}

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
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />}>
        <QuestionBox />
      </Suspense>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Brands</h2>
        <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
          <Brands />
        </Suspense>
      </section>
    </main>
  );
}
