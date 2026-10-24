import { Suspense } from "react";
import Link from "next/link";
import { verifyVote } from "@/lib/delivery/links";
import { AutoVote } from "./auto-vote";

export const metadata = { title: "Thanks · Ask-a-Trend" };

// Where 👍/👎 links in emails and Slack land. The vote is recorded by the browser after the page
// loads, so link scanners that pre-open email links (and don't run scripts) can't vote.
export default function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <Suspense fallback={<p className="text-zinc-500">Recording your vote…</p>}>
        <Vote searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Vote({ searchParams }: Pick<PageProps<"/feedback">, "searchParams">) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : (q[k] ?? "")) as string;
  const [d, k, s] = [one("d"), one("k"), one("s")];
  const v = one("v") === "1" ? 1 : one("v") === "-1" ? -1 : 0;
  if (!d || !k || !v || !verifyVote(d, k, v, s)) {
    return <p className="text-red-700 dark:text-red-400">This feedback link isn&apos;t valid.</p>;
  }
  return (
    <>
      <AutoVote digestId={d} itemKey={k} vote={v} sig={s} />
      <Link href={`/digests/${d}`} className="text-sm text-zinc-500 underline-offset-2 hover:underline">
        Open the digest
      </Link>
    </>
  );
}
