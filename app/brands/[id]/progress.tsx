"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/form";

export type Stage = "reading" | "profiling" | "failed";

const STEPS = [
  { stage: "reading", label: "Reading the words on your site" },
  { stage: "profiling", label: "Writing your style profile" },
] as const;

const SLOW_AFTER_S = 120;

// Re-renders the page every 2 seconds until the server says the profile is ready.
export function Progress({ stage, retry }: { stage: Stage; retry: () => Promise<void> }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (stage === "failed") return;
    const poll = setInterval(() => router.refresh(), 2000);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [stage, router]);

  async function doRetry() {
    setRetrying(true);
    setSeconds(0);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  }

  const current = STEPS.findIndex((s) => s.stage === stage);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800" aria-live="polite">
      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => {
          const done = stage !== "failed" && i < current;
          const active = i === current;
          return (
            <li key={s.stage} className={`flex items-center gap-3 ${done || active ? "" : "text-zinc-400"}`}>
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs ${
                  done ? "bg-green-600 text-white" : active ? "border-2 border-zinc-900 dark:border-zinc-100" : "border border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {done ? "✓" : active ? <span className="size-2 animate-pulse rounded-full bg-zinc-900 dark:bg-zinc-100" /> : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
      {stage === "failed" ? (
        <FailedNotice retrying={retrying} onRetry={doRetry} />
      ) : (
        <p className="text-sm text-zinc-500">
          {seconds < SLOW_AFTER_S ? `Usually under 2 minutes · ${seconds}s` : "This is taking longer than usual. It's still running; you can also start over."}
        </p>
      )}
      {stage !== "failed" && seconds >= SLOW_AFTER_S && (
        <Button variant="secondary" className="self-start" pending={retrying} onClick={doRetry}>
          Start over
        </Button>
      )}
    </div>
  );
}

function FailedNotice({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-red-700 dark:text-red-400">
        We couldn&apos;t finish. Usually the site blocks automated reading, or there wasn&apos;t enough text on it. Pasting
        a few Instagram captions when you sign up helps.
      </p>
      <Button variant="secondary" className="self-start" pending={retrying} onClick={onRetry}>
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}
