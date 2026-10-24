import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { refresh } from "next/cache";
import type { DigestSpec, TrendItem } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { saveVote } from "@/lib/delivery/feedback";

export const metadata = { title: "Trend digest · Ask-a-Trend" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function vote(digestId: string, itemKey: string, value: 1 | -1) {
  "use server";
  await saveVote(digestId, itemKey, value);
  refresh();
}

export default function DigestPage({ params }: PageProps<"/digests/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Digest params={params} />
      </Suspense>
    </main>
  );
}

async function Digest({ params }: Pick<PageProps<"/digests/[id]">, "params">) {
  const { id } = await params;
  await connection();
  if (!UUID.test(id)) notFound();
  const [{ data: row }, { data: votes }] = await Promise.all([
    db().from("digests").select("id, brand_id, spec, channel, sent_at, brands(name)").eq("id", id).maybeSingle(),
    db().from("feedback").select("item_key, vote").eq("digest_id", id),
  ]);
  if (!row) notFound();
  const d = row.spec as DigestSpec;
  const brand = (row.brands as unknown as { name: string } | null)?.name ?? "Your brand";
  const voted = new Map((votes ?? []).map((v) => [v.item_key as string, v.vote as number]));

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href={`/brands/${row.brand_id}`} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← {brand}
        </Link>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Trend digest · {d.date}
          {row.sent_at ? ` · sent by ${row.channel}` : " · not sent"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{d.headline}</h1>
      </div>
      {d.elements.map((e) => (
        <section key={e.key} className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h2 className="text-xl font-semibold">{e.name}</h2>
          <p className="text-zinc-700 dark:text-zinc-300">{e.reason}</p>
          <p className="text-zinc-600 dark:text-zinc-400">
            <em>Fits your brand because</em> {e.fits_because}
          </p>
          <Votes current={voted.get(e.key)} up={vote.bind(null, id, e.key, 1)} down={vote.bind(null, id, e.key, -1)} labels={["More like this", "Not for us"]} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {e.examples.map((i) => {
              const key = `${e.key}:${i.id}`;
              return (
                <li key={i.id} className="flex flex-col gap-1.5">
                  <Example item={i} />
                  <Votes current={voted.get(key)} up={vote.bind(null, id, key, 1)} down={vote.bind(null, id, key, -1)} small />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-xs text-zinc-500">Examples are real products from public store listings; prices are in each store&apos;s currency.</p>
    </>
  );
}

function Example({ item }: { item: TrendItem }) {
  let store = "";
  try {
    store = item.link ? new URL(item.link).host.replace(/^www\./, "") : "";
  } catch {}
  return (
    <a href={item.link ?? undefined} target="_blank" rel="noreferrer" className="flex flex-col gap-1 hover:opacity-80">
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote store images, any host
        <img src={item.image_url} alt={item.title ?? ""} className="aspect-[4/5] w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" loading="lazy" />
      ) : (
        <div className="aspect-[4/5] w-full rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      )}
      <span className="text-sm leading-tight">{item.title}</span>
      <span className="text-xs text-zinc-500">
        {[item.price != null ? `${item.price} ${item.currency ?? ""}` : "", store].filter(Boolean).join(" · ")}
      </span>
    </a>
  );
}

function Votes({ current, up, down, labels, small }: { current?: number; up: () => Promise<void>; down: () => Promise<void>; labels?: [string, string]; small?: boolean }) {
  const cls = (on: boolean) =>
    `rounded-full border ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} ${
      on ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
    }`;
  return (
    <div className="flex shrink-0 gap-1.5">
      <form action={up}>
        <button type="submit" aria-pressed={current === 1} className={cls(current === 1)} aria-label={labels?.[0] ?? "Like"}>
          👍{labels ? ` ${labels[0]}` : ""}
        </button>
      </form>
      <form action={down}>
        <button type="submit" aria-pressed={current === -1} className={cls(current === -1)} aria-label={labels?.[1] ?? "Dislike"}>
          👎{labels ? ` ${labels[1]}` : ""}
        </button>
      </form>
    </div>
  );
}
