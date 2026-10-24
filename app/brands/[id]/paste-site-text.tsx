"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/form";
import type { SaveState } from "./actions";

// For a site we couldn't read: the founder pastes its words and the profile is rebuilt with them.
export function PasteSiteText({ paste, host }: { paste: (prev: SaveState, form: FormData) => Promise<SaveState>; host: string }) {
  const [state, action, pending] = useActionState(paste, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label={`Paste text from ${host}`}
        htmlFor="site_text"
        hint="Copy your About page and a few product descriptions (with prices, if you can). We'll rebuild your profile with them."
        error={!state.ok && state.message ? state.message : undefined}
      >
        <textarea id="site_text" name="site_text" rows={6} maxLength={20_000} className={inputClass} />
      </Field>
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        {pending ? "Saving…" : "Use this text"}
      </Button>
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>}
    </form>
  );
}
