import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { BrandProfile } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { recrawl, saveProfile } from "./actions";
import { sendTestDigest } from "./digest-actions";
import { DigestPanel } from "./digest-panel";
import { ProfileEditor } from "./profile-editor";
import { Progress, type Stage } from "./progress";
import { editorVocab } from "./vocab";

// Re-crawl runs the crawl + AI profile in the background (after()); give it room.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_LABELS: Record<string, [string, string]> = {
  about: ["About page", "About pages"],
  product: ["product", "products"],
  alt: ["set of image descriptions", "sets of image descriptions"],
  ig_caption: ["Instagram paste", "Instagram pastes"],
  ig_bio: ["Instagram bio", "Instagram bios"],
  other: ["other page", "other pages"],
};

export default function BrandPage({ params }: PageProps<"/brands/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Brand params={params} />
      </Suspense>
    </main>
  );
}

async function Brand({ params }: Pick<PageProps<"/brands/[id]">, "params">) {
  const { id } = await params;
  await connection();
  if (!UUID.test(id)) notFound();

  const [brandRes, profileRes, pagesRes, vocab, digestsRes] = await Promise.all([
    db().from("brands").select("id, name, website_url, crawl_status, digest_channel").eq("id", id).maybeSingle(),
    db().from("brand_profiles").select("*").eq("brand_id", id).maybeSingle(),
    db().from("crawl_pages").select("kind").eq("brand_id", id),
    editorVocab(),
    db().from("digests").select("id, spec, channel, sent_at").eq("brand_id", id).order("created_at", { ascending: false }).limit(5),
  ]);
  if (brandRes.error) throw brandRes.error;
  if (!brandRes.data) notFound();
  const brand = brandRes.data;
  const profile = profileRes.data as BrandProfile | null;

  const counts = new Map<string, number>();
  for (const p of pagesRes.data ?? []) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  const readSummary = [...counts.entries()]
    .map(([kind, n]) => `${n} ${(KIND_LABELS[kind] ?? [kind, kind])[n === 1 ? 0 : 1]}`)
    .join(", ");

  const retry = recrawl.bind(null, id);
  const busy = brand.crawl_status === "running" || brand.crawl_status === "pending";
  const stage: Stage | null =
    brand.crawl_status === "failed" ? "failed" : busy ? ([...counts.keys()].some((k) => !k.startsWith("ig_")) ? "profiling" : "reading") : !profile ? "failed" : null;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{brand.name}</h1>
        <a href={brand.website_url} target="_blank" rel="noreferrer" className="text-sm text-zinc-500 hover:underline">
          {brand.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      </div>

      {!profile ? (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">We&apos;re learning your brand. This page updates by itself.</p>
          <Progress stage={stage ?? "profiling"} retry={retry} />
        </>
      ) : (
        <>
          {stage && stage !== "failed" && <Progress stage={stage} retry={retry} />}
          {stage === "failed" && (
            <p className="text-sm text-red-700 dark:text-red-400">The last re-read didn&apos;t finish. Your profile below is unchanged.</p>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Your style profile</h2>
            <p className="text-sm text-zinc-500">
              {readSummary ? `Based on ${readSummary}. ` : ""}Check it and fix anything that&apos;s off; your trend digest is matched to this.
            </p>
          </div>
          {/* Remount (fresh values) when a re-read finishes, but not on the founder's own save,
              so the "Saved" message survives the refresh. */}
          <ProfileEditor key={brand.crawl_status} profile={profile} vocab={vocab} save={saveProfile.bind(null, id)} />
          <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <DigestPanel
              channel={brand.digest_channel}
              send={sendTestDigest.bind(null, id)}
              recent={(digestsRes.data ?? []).map((r) => ({
                id: r.id,
                date: r.spec.date,
                headline: r.spec.headline,
                sent: r.sent_at ? r.channel : null,
              }))}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/ask?brand=${id}`} className="underline underline-offset-2">
              Ask a trend question
            </Link>
            <Link href={`/brands/${id}/settings`} className="underline underline-offset-2">
              Settings: weights, delivery, paid sources
            </Link>
          </div>
          <form action={retry} className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <button type="submit" disabled={!!stage && stage !== "failed"} className="text-sm text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50">
              Re-read my site (keeps your edits)
            </button>
          </form>
        </>
      )}
    </>
  );
}
