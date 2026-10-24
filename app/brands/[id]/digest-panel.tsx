"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/form";
import type { TestDigestState } from "./digest-actions";

export function DigestPanel({
  channel,
  send,
  recent,
}: {
  channel: string;
  send: () => Promise<TestDigestState>;
  recent: { id: string; date: string; headline: string; sent: string | null }[];
}) {
  const [state, action, pending] = useActionState(send, { ok: true, message: "" });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Your trend digest</h2>
        <p className="text-sm text-zinc-500">On-trend ideas that fit this profile, sent by {channel}.</p>
      </div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Building your digest…" : "Send test digest now"}
        </Button>
        {state.message && !pending && (
          <p role="status" className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
            {state.message}{" "}
            {state.digestId && (
              <Link href={`/digests/${state.digestId}`} className="underline underline-offset-2">
                View it
              </Link>
            )}
          </p>
        )}
      </form>
      {recent.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {recent.map((r) => (
            <li key={r.id}>
              <Link href={`/digests/${r.id}`} className="hover:underline">
                {r.date} · {r.headline}
              </Link>
              <span className="text-zinc-500"> · {r.sent ? `sent by ${r.sent}` : "not sent"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
