import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { BrandProfile } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { isSitePage, PASTED_SITE_URL, RESEARCH_PREFIX, researchSources } from "@/lib/engine/brand-research";
import { pasteSiteText, recrawl, saveProfile } from "./actions";
import { sendTestDigest } from "./digest-actions";
import { DigestPanel } from "./digest-panel";
import { PasteSiteText } from "./paste-site-text";
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

  const [brandRes, profileRes, pagesRes, researchRes, vocab, digestsRes] = await Promise.all([
    db().from("brands").select("id, name, website_url, crawl_status, digest_channel").eq("id", id).maybeSingle(),
    db().from("brand_profiles").select("*").eq("brand_id", id).maybeSingle(),
    db().from("crawl_pages").select("kind, url").eq("brand_id", id),
    db().from("crawl_pages").select("text").eq("brand_id", id).eq("url", `${RESEARCH_PREFIX}about`).maybeSingle(),
    editorVocab(),
    db().from("digests").select("id, spec, channel, sent_at").eq("brand_id", id).order("created_at", { ascending: false }).limit(5),
  ]);
  if (brandRes.error) throw brandRes.error;
  if (!brandRes.data) notFound();
  const brand = brandRes.data;
  const profile = profileRes.data as BrandProfile | null;

  const allPages = pagesRes.data ?? [];
  const counts = new Map<string, number>();
  for (const p of allPages) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  const siteCounts = new Map<string, number>();
  for (const p of allPages.filter(isSitePage)) siteCounts.set(p.kind, (siteCounts.get(p.kind) ?? 0) + 1);
  const sources = researchRes.data ? researchSources(researchRes.data.text) : [];
  const pasted = allPages.some((p) => p.url === PASTED_SITE_URL);
  const readSummary = [
    ...[...siteCounts.entries()].map(([kind, n]) => `${n} ${(KIND_LABELS[kind] ?? [kind, kind])[n === 1 ? 0 : 1]}`),
    researchRes.data ? `${sources.length || "several"} public source${sources.length === 1 ? "" : "s"}` : "",
    pasted ? "the text you pasted" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const host = brand.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // We couldn't read (much of) the site, so the profile leans on public sources: say so, and offer the paste box.
  const fromPublicSources = !!researchRes.data;
  const paste = pasteSiteText.bind(null, id);

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
          {stage === "failed" && (
            <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              <PasteSiteText paste={paste} host={host} />
            </div>
          )}
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
          {fromPublicSources && (
            <details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40" open={!pasted}>
              <summary className="cursor-pointer font-medium">
                We couldn&apos;t read much of {host}, so this profile also uses public sources about you.
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {sources.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {sources.slice(0, 8).map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {s.title || new URL(s.url).hostname}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <PasteSiteText paste={paste} host={host} />
              </div>
            </details>
          )}
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
