import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AskClient } from "./ask-client";
import { exampleQuestions, loadPresets } from "./data";
import { brandById, currentBrand } from "../current-brand";

export const metadata = { title: "Ask a trend question · Ask-a-Trend" };

export default function AskPage({ searchParams }: PageProps<"/ask">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Ask-a-Trend
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Ask searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Answers are always for one brand: the one in the link (from its own profile page), else this browser's own.
async function Ask({ searchParams }: Pick<PageProps<"/ask">, "searchParams">) {
  const q = await searchParams;
  await connection();
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : (q[k] ?? "")) as string;
  const [linked, examples, presets] = await Promise.all([one("brand") ? brandById(one("brand")) : null, exampleQuestions(), loadPresets()]);
  const brand = linked ?? (await currentBrand());
  if (!brand) redirect("/");
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Ask a trend question</h1>
        <p className="text-zinc-500">For {brand.name}</p>
      </div>
      {brand.hasProfile ? (
        <AskClient brandId={brand.id} initialQuestion={one("q").slice(0, 500)} examples={examples} presets={presets} />
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          Answers are matched to your style. We&apos;re still writing your <Link href={`/brands/${brand.id}`} className="underline">style profile</Link>; come back once it&apos;s ready.
        </p>
      )}
    </>
  );
}
