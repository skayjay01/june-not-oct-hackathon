import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { inputClass } from "@/components/form";
import { changeBrand } from "./actions";
import { exampleQuestions } from "./ask/data";
import { currentBrand, previousBrand, type CurrentBrand } from "./current-brand";
import { OnboardForm } from "./onboard/onboard-form";

// The form's action starts the crawl + AI profile in the background (after()); give it room.
export const maxDuration = 300;

// The home screen is the customer's own workspace: one brand, theirs. No brand yet → add it here.
async function Home() {
  await connection(); // read at request time, not baked in at build
  const brand = await currentBrand();
  return brand ? <Workspace brand={brand} /> : <Welcome previous={await previousBrand()} />;
}

function Welcome({ previous }: { previous: CurrentBrand | null }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Ask-a-Trend</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          An AI trend scout for small fashion brands. Tell us your brand name. We&apos;ll find your website and social
          accounts, learn your style in a couple of minutes, then send you on-trend ideas that fit it. You can edit the
          profile before anything is sent.
        </p>
        {previous && (
          <p className="text-sm">
            {/* A full page load: /use sets the cookie and redirects, which a client-side Link wouldn't re-render. */}
            <a href={`/brands/${previous.id}/use`} className="underline underline-offset-2">
              Back to {previous.name}
            </a>
          </p>
        )}
      </div>
      <OnboardForm />
    </div>
  );
}

// The question box (US-005): a plain GET form to /ask, which streams the dashboard.
async function Workspace({ brand }: { brand: CurrentBrand }) {
  const examples = await exampleQuestions();
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{brand.name}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href={`/brands/${brand.id}`} className="underline underline-offset-2">
            Your style profile and digest
          </Link>
          <Link href={`/brands/${brand.id}/settings`} className="underline underline-offset-2">
            Settings
          </Link>
          <form action={changeBrand}>
            <button type="submit" className="underline underline-offset-2">
              Change brand
            </button>
          </form>
        </div>
      </div>
      {brand.hasProfile ? (
        <form action="/ask" className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <label htmlFor="q" className="font-medium">
            Ask a trend question
          </label>
          <textarea id="q" name="q" rows={2} maxLength={500} required placeholder="Which colors are rising in summer dresses under $50?" className={`${inputClass} text-lg`} />
          <div>
            <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
              Ask
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <li key={ex}>
                <Link href={`/ask?${new URLSearchParams({ q: ex })}`} className="block rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-zinc-500 dark:border-zinc-700">
                  {ex}
                </Link>
              </li>
            ))}
          </ul>
        </form>
      ) : (
        <p className="rounded-2xl border border-zinc-200 p-4 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          We&apos;re still learning your brand. Once your <Link href={`/brands/${brand.id}`} className="underline">style profile</Link> is ready you can ask trend questions here.
        </p>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-16">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />}>
        <Home />
      </Suspense>
    </main>
  );
}
