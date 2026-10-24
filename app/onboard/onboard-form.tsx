"use client";

import { useActionState, useState } from "react";
import { Button, Field, inputClass } from "@/components/form";
import { createBrand, type OnboardState } from "./actions";

const initial: OnboardState = { errors: {}, values: {} };

export function OnboardForm() {
  const [state, action, pending] = useActionState(createBrand, initial);
  const v = state.values;
  const e = state.errors;
  const [channel, setChannel] = useState(v.channel || "email");

  return (
    <form action={action} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Your brand</h2>
        <Field label="Brand name" htmlFor="name" error={e.name}>
          <input id="name" name="name" defaultValue={v.name} className={inputClass} autoComplete="organization" />
        </Field>
        <Field label="Website" htmlFor="website" error={e.website} hint="We read the words on your site (About page, product descriptions), not the pictures.">
          <input id="website" name="website" defaultValue={v.website} placeholder="yourbrand.com" className={inputClass} inputMode="url" />
        </Field>
        <Field label="Instagram handle (optional)" htmlFor="instagram" error={e.instagram}>
          <input id="instagram" name="instagram" defaultValue={v.instagram} placeholder="@yourbrand" className={inputClass} />
        </Field>
        <Field
          label="Instagram bio and a few recent captions (optional)"
          htmlFor="instagram_text"
          hint="Paste them in. It helps us learn your voice; we can't read Instagram automatically yet."
        >
          <textarea id="instagram_text" name="instagram_text" defaultValue={v.instagram_text} rows={4} className={inputClass} />
        </Field>
        <Field
          label="Other pages to read (optional)"
          htmlFor="extra_urls"
          error={e.extra_urls}
          hint="One web address per line, e.g. your lookbook or a brand you watch."
        >
          <textarea id="extra_urls" name="extra_urls" defaultValue={v.extra_urls} rows={2} className={inputClass} />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Your trend digest</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Send it by</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ["email", "Email"],
              ["slack", "Slack"],
              ["whatsapp", "WhatsApp (demo)"],
            ].map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-100 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800">
                <input type="radio" name="channel" value={value} checked={channel === value} onChange={() => setChannel(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={channel === "email" ? "Email" : "Email (optional)"} htmlFor="email" error={e.email}>
          <input id="email" name="email" type="email" defaultValue={v.email} className={inputClass} autoComplete="email" />
        </Field>
        {channel === "slack" && (
          <Field
            label="Slack webhook link"
            htmlFor="slack_webhook"
            error={e.slack_webhook}
            hint="In Slack: Apps → Incoming Webhooks → Add to a channel, then copy the link."
          >
            <input id="slack_webhook" name="slack_webhook" defaultValue={v.slack_webhook} placeholder="https://hooks.slack.com/services/…" className={inputClass} />
          </Field>
        )}
        <Field label="How often" htmlFor="frequency">
          <select id="frequency" name="frequency" defaultValue={v.frequency || "weekly"} className={inputClass}>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </Field>
      </section>

      {e.form && <p className="text-sm text-red-700 dark:text-red-400">{e.form}</p>}
      <Button type="submit" pending={pending} className="self-start">
        {pending ? "Starting…" : "Learn my brand"}
      </Button>
    </form>
  );
}
