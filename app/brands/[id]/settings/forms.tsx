"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/form";
import { WeightsEditor, type Preset, type WeightValues } from "@/components/weights-editor";
import type { Result } from "./actions";

const Status = ({ r }: { r: Result | null }) =>
  r?.message ? (
    <p role="status" className={`text-sm ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
      {r.message}
    </p>
  ) : null;

export function WeightsForm({
  initial,
  initialPreset,
  presets,
  save,
}: {
  initial: WeightValues;
  initialPreset: string | null;
  presets: Preset[];
  save: (w: WeightValues, preset: string | null) => Promise<Result>;
}) {
  const [w, setW] = useState(initial);
  const [preset, setPreset] = useState(initialPreset);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <WeightsEditor
        value={w}
        presets={presets}
        preset={preset}
        onChange={(next, p) => {
          setW(next);
          setPreset(p);
          setResult(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" pending={pending} onClick={() => start(async () => setResult(await save(w, preset)))}>
          {pending ? "Saving…" : "Save weights"}
        </Button>
        <Status r={result} />
      </div>
    </div>
  );
}

export function DeliveryForm({
  initial,
  save,
}: {
  initial: { channel: string; frequency: string; email: string; slack: string };
  save: (prev: Result, form: FormData) => Promise<Result>;
}) {
  const [state, action, pending] = useActionState(save, { ok: true, message: "" });
  const [channel, setChannel] = useState(initial.channel);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Send by" htmlFor="channel">
        <select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
          <option value="email">Email</option>
          <option value="slack">Slack</option>
          <option value="whatsapp">WhatsApp (demo)</option>
        </select>
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" defaultValue={initial.email} className={inputClass} />
      </Field>
      {(channel === "slack" || initial.slack) && (
        <Field label="Slack webhook link" htmlFor="slack_webhook" hint="In Slack: Apps → Incoming Webhooks → Add to a channel, then copy the link.">
          <input id="slack_webhook" name="slack_webhook" defaultValue={initial.slack} placeholder="https://hooks.slack.com/services/…" className={inputClass} />
        </Field>
      )}
      <Field label="How often" htmlFor="frequency">
        <select id="frequency" name="frequency" defaultValue={initial.frequency} className={inputClass}>
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Status r={state} />
      </div>
    </form>
  );
}

export function LicensedSource({
  name,
  api,
  count,
  upload,
  disconnect,
}: {
  name: string;
  api: string | null;
  count: number;
  upload: (prev: Result, form: FormData) => Promise<Result>;
  disconnect: () => Promise<void>;
}) {
  const [state, action, pending] = useActionState(upload, { ok: true, message: "" });
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{name}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${count ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
          {count ? `Connected · ${count.toLocaleString()} items` : "Not connected"}
        </span>
      </div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input name="file" type="file" accept=".csv,text/csv" aria-label={`${name} export (CSV)`} className="text-sm file:mr-2 file:rounded-lg file:border file:border-zinc-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm dark:file:border-zinc-700" />
        <Button type="submit" variant="secondary" pending={pending}>
          {pending ? "Importing…" : "Upload export"}
        </Button>
      </form>
      <Status r={state} />
      <p className="text-xs text-zinc-500">{api ? `Direct API connection (${api}) can be added when you have the key.` : "No public API: upload your exports."}</p>
      {count > 0 && (
        <form action={disconnect}>
          <button type="submit" className="text-sm text-red-700 underline-offset-2 hover:underline dark:text-red-400">
            Disconnect and delete this data
          </button>
        </form>
      )}
    </li>
  );
}

export function DeleteBrand({ name, remove }: { name: string; remove: (prev: Result, form: FormData) => Promise<Result> }) {
  const [state, action, pending] = useActionState(remove, { ok: true, message: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={`Type “${name}” to confirm`} htmlFor="confirm">
        <input id="confirm" name="confirm" autoComplete="off" className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete this brand"}
        </button>
        <Status r={state} />
      </div>
    </form>
  );
}
