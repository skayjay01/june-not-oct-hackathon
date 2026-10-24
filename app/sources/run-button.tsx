"use client";

import { useActionState } from "react";
import { Button } from "@/components/form";
import { runNow } from "./actions";

export function RunButton() {
  const [state, action, pending] = useActionState(runNow, { results: [], message: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Collecting… (up to a few minutes)" : "Run now"}
        </Button>
        {state.message && !pending && <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>}
      </div>
      {state.results.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {state.results.map((r) => (
            <li key={r.key}>
              <span className="font-medium">{r.key}</span>: {r.ran ? `${r.rows} rows · ${r.note}` : r.note}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
