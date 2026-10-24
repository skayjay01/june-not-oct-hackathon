import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AskClient } from "./ask-client";
import { brandsWithProfiles, exampleQuestions, loadPresets } from "./data";

export const metadata = { title: "Ask a trend question · Ask-a-Trend" };

export default function AskPage({ searchParams }: PageProps<"/ask">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Ask-a-Trend
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Ask a trend question</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Ask searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Ask({ searchParams }: Pick<PageProps<"/ask">, "searchParams">) {
  const q = await searchParams;
  await connection();
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : (q[k] ?? "")) as string;
  const [brands, examples, presets] = await Promise.all([brandsWithProfiles(), exampleQuestions(), loadPresets()]);
  if (!brands.length) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        Answers are matched to a brand&apos;s style. <Link href="/onboard" className="underline">Add your brand</Link> first.
      </p>
    );
  }
  const brand = brands.some((b) => b.id === one("brand")) ? one("brand") : brands[0].id;
  return <AskClient brands={brands} initialBrand={brand} initialQuestion={one("q").slice(0, 500)} examples={examples} presets={presets} />;
}
