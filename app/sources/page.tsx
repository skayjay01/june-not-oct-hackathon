import { Suspense } from "react";
import Link from "next/link";
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
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Ask-a-Trend
      </Link>
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
