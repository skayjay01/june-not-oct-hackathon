import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { DashboardSpec } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { SharedView } from "./shared-view";

export const metadata = { title: "Shared dashboard · Ask-a-Trend" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SharedDashboardPage({ params }: PageProps<"/d/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← Ask-a-Trend
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Shared params={params} />
      </Suspense>
    </main>
  );
}

async function Shared({ params }: Pick<PageProps<"/d/[id]">, "params">) {
  const { id } = await params;
  await connection();
  if (!UUID.test(id)) notFound();
  // only rows saved via "Save & share", never the question cache
  const { data: row } = await db()
    .from("saved_answers")
    .select("brand_id, spec, created_at, brands(name)")
    .eq("question_hash", `share:${id}`)
    .maybeSingle();
  if (!row?.brand_id) notFound();
  const spec = row.spec as DashboardSpec;
  const brand = (row.brands as unknown as { name: string } | null)?.name ?? "a brand";
  return (
    <>
      <p className="text-sm text-zinc-500">
        Saved {String(row.created_at).slice(0, 10)} for {brand} · “{spec.question}”
      </p>
      <SharedView brandId={row.brand_id as string} spec={spec} />
      <Link
        href={`/ask?brand=${row.brand_id}&q=${encodeURIComponent(spec.question)}`}
        className="self-start text-sm text-zinc-500 underline-offset-2 hover:underline"
      >
        Ask this again with the latest data →
      </Link>
    </>
  );
}
