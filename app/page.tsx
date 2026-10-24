import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db/server";

async function DbStatus() {
  await connection(); // check at request time, not baked in at build
  let problem: string | null = null;
  try {
    const { error } = await db().from("brands").select("id", { count: "exact", head: true });
    // Before the B1 migration runs, "brands" doesn't exist yet — the connection still works.
    if (error && error.code !== "42P01" && error.code !== "PGRST205") problem = error.message;
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  return problem ? (
    <p className="text-red-700 dark:text-red-400">Database not connected: {problem}</p>
  ) : (
    <p className="text-green-700 dark:text-green-400">Database connected ✓</p>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Ask-a-Trend</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        An AI trend scout for small fashion brands.
      </p>
      <Suspense fallback={<p className="text-zinc-500">Checking database…</p>}>
        <DbStatus />
      </Suspense>
    </main>
  );
}
