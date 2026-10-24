"use client";

import { useActionState, useMemo, useState } from "react";
import type { BrandProfile } from "@/lib/contracts";
import { Button, Field, inputClass } from "@/components/form";
import type { SaveState } from "./actions";
import type { EditorVocab, Option } from "./vocab";

const STYLE_MIN = 3;
const STYLE_MAX = 5;

export function ProfileEditor({
  profile,
  vocab,
  save,
}: {
  profile: BrandProfile;
  vocab: EditorVocab;
  save: (prev: SaveState, form: FormData) => Promise<SaveState>;
}) {
  const [state, action, pending] = useActionState(save, { ok: true, message: "" });
  const [styleTags, setStyleTags] = useState(profile.style_tags);
  const [categories, setCategories] = useState(profile.categories);
  const [colors, setColors] = useState(profile.colors);
  const edited = new Set(profile.edited_fields);

  const styleProblem =
    styleTags.length < STYLE_MIN ? `Pick at least ${STYLE_MIN}.` : styleTags.length > STYLE_MAX ? `Pick at most ${STYLE_MAX}.` : undefined;

  return (
    <form action={action} className="flex flex-col gap-8">
      {[...styleTags.map((v) => ["style_tags", v]), ...categories.map((v) => ["categories", v]), ...colors.map((v) => ["colors", v])].map(
        ([name, value]) => (
          <input key={`${name}:${value}`} type="hidden" name={name} value={value} />
        ),
      )}

      <Field label="Summary" htmlFor="summary" hint={edited.has("summary") ? "Edited by you" : "Written by the AI from what we read about you"}>
        <textarea id="summary" name="summary" defaultValue={profile.summary ?? ""} rows={4} className={inputClass} />
      </Field>

      <ChipPicker
        title="Style"
        hint={`${STYLE_MIN}–${STYLE_MAX} tags that describe your look`}
        error={styleProblem}
        edited={edited.has("style_tags")}
        options={vocab.styleTags}
        selected={styleTags}
        onChange={setStyleTags}
      />

      <ChipPicker
        title="What you sell"
        hint="Your core categories"
        edited={edited.has("categories")}
        options={vocab.categories}
        selected={categories}
        onChange={setCategories}
      />

      <ColorPicker edited={edited.has("colors")} options={vocab.colors} selected={colors} onChange={setColors} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Typical price ({profile.currency}){(edited.has("price_min") || edited.has("price_max")) && <EditedBadge />}
        </legend>
        <div className="flex items-center gap-2">
          <input name="price_min" aria-label="Lowest typical price" defaultValue={profile.price_min ?? ""} inputMode="decimal" className={`${inputClass} max-w-32`} />
          <span className="text-zinc-500">to</span>
          <input name="price_max" aria-label="Highest typical price" defaultValue={profile.price_max ?? ""} inputMode="decimal" className={`${inputClass} max-w-32`} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} disabled={!!styleProblem}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state.message && (
          <p role="status" className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function EditedBadge() {
  return <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">edited by you</span>;
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function ChipPicker({
  title,
  hint,
  error,
  edited,
  options,
  selected,
  onChange,
}: {
  title: string;
  hint: string;
  error?: string;
  edited: boolean;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Selected first, so the profile reads at a glance; the rest one click away.
  const shown = showAll ? options : options.filter((o) => selected.includes(o.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">
        {title}
        {edited && <EditedBadge />}
      </legend>
      <div className="flex flex-wrap gap-2">
        {shown.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              title={o.hint}
              aria-pressed={on}
              onClick={() => onChange(toggle(selected, o.id))}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setShowAll((s) => !s)} className="px-2 py-1 text-sm text-zinc-500 underline-offset-2 hover:underline">
          {showAll ? "Show selected only" : selected.length ? "Change…" : "Choose…"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : <p className="text-sm text-zinc-500">{hint}</p>}
    </fieldset>
  );
}

function ColorPicker({
  edited,
  options,
  selected,
  onChange,
}: {
  edited: boolean;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Option[]>();
    for (const o of options) m.set(o.group ?? "other", [...(m.get(o.group ?? "other") ?? []), o]);
    return [...m.entries()];
  }, [options]);
  const byId = new Map(options.map((o) => [o.id, o]));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">
        Typical colors
        {edited && <EditedBadge />}
      </legend>
      <div className="flex flex-wrap gap-2">
        {selected.map((id) => {
          const o = byId.get(id);
          return o ? <Swatch key={id} option={o} on onClick={() => onChange(toggle(selected, id))} /> : null;
        })}
        <button type="button" onClick={() => setShowAll((s) => !s)} className="px-2 py-1 text-sm text-zinc-500 underline-offset-2 hover:underline">
          {showAll ? "Done" : "Change…"}
        </button>
      </div>
      {showAll && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          {groups.map(([family, list]) => (
            <div key={family} className="flex flex-col gap-1.5">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{family}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((o) => (
                  <Swatch key={o.id} option={o} on={selected.includes(o.id)} onClick={() => onChange(toggle(selected, o.id))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-zinc-500">Named from the team&apos;s fixed color list, so names stay consistent in every digest.</p>
    </fieldset>
  );
}

function Swatch({ option, on, onClick }: { option: Option; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${
        on ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
      }`}
    >
      <span className="size-5 rounded-full border border-black/10" style={{ background: option.hex ?? "transparent" }} />
      {option.label}
      {on && <span aria-hidden>✓</span>}
    </button>
  );
}
