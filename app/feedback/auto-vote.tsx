"use client";

import { useEffect, useState } from "react";
import { recordSignedVote } from "./actions";

export function AutoVote({ digestId, itemKey, vote, sig }: { digestId: string; itemKey: string; vote: 1 | -1; sig: string }) {
  const [state, setState] = useState<"saving" | "saved" | "failed">("saving");
  useEffect(() => {
    recordSignedVote(digestId, itemKey, vote, sig)
      .then((ok) => setState(ok ? "saved" : "failed"))
      .catch(() => setState("failed"));
  }, [digestId, itemKey, vote, sig]);

  if (state === "failed") return <p className="text-red-700 dark:text-red-400">We couldn&apos;t record that. Please try the link again.</p>;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="text-4xl">{vote === 1 ? "👍" : "👎"}</p>
      <p className="text-lg font-medium">{state === "saving" ? "Recording…" : "Thanks, noted."}</p>
      <p className="text-zinc-600 dark:text-zinc-400">
        {vote === 1 ? "We'll show you more like this." : "We'll keep this trend out of your next digests."}
      </p>
    </div>
  );
}
