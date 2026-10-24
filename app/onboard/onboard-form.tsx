"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/form";
import { SOCIAL_PLATFORMS, type BrandPresence, type SocialPlatform } from "@/lib/contracts";
import { createBrand, findBrand, type OnboardState } from "./actions";

const initial: OnboardState = { errors: {}, values: {} };

const LABELS: Record<SocialPlatform, string> = { instagram: "Instagram", tiktok: "TikTok", pinterest: "Pinterest", facebook: "Facebook", x: "X (Twitter)", youtube: "YouTube" };

/** Step 1 asks only for the brand name; step 2 shows what we found and asks only for what we didn't. */
export function OnboardForm() {
  const [found, setFound] = useState<BrandPresence | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [searching, startSearch] = useTransition();
  const [name, setName] = useState("");
  const [knownSite, setKnownSite] = useState("");
  const [showSite, setShowSite] = useState(false);

  const lookUp = (n: string, site?: string) => {
    setLookupError("");
    startSearch(async () => {
      const res = await findBrand(n, site);
      if ("error" in res) setLookupError(res.error);
      else setFound(res);
    });
  };

  if (!found) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookUp(name, showSite ? knownSite : undefined);
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Brand name" htmlFor="lookup_name" error={lookupError} hint="We'll find your website and social accounts ourselves, then show you what we found.">
          <input id="lookup_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} autoComplete="organization" autoFocus />
        </Field>
        {showSite ? (
          <Field label="Website (optional)" htmlFor="lookup_site" hint="Helps if your name is shared with another brand.">
            <input id="lookup_site" value={knownSite} onChange={(e) => setKnownSite(e.target.value)} placeholder="yourbrand.com" className={inputClass} inputMode="url" />
          </Field>
        ) : (
          <button type="button" onClick={() => setShowSite(true)} className="self-start text-sm text-zinc-500 underline-offset-2 hover:underline">
            Add your website too
          </button>
        )}
        <Button type="submit" pending={searching} disabled={!name.trim()} className="self-start">
          {searching ? "Looking you up…" : "Find my brand"}
        </Button>
        {searching && <p className="text-sm text-zinc-500">Searching the web for {name.trim()} and reading your homepage. This takes about 15 seconds.</p>}
      </form>
    );
  }

  return (
    <ReviewForm
      key={`${found.name}|${found.website}`}
      found={found}
      searching={searching}
      onRetry={(n, site) => lookUp(n, site)}
      onBack={() => {
        setName(found.name);
        setFound(null);
      }}
    />
  );
}

function ReviewForm({ found, searching, onRetry, onBack }: { found: BrandPresence; searching: boolean; onRetry: (name: string, site?: string) => void; onBack: () => void }) {
  const [state, action, pending] = useActionState(createBrand, initial);
  const v = state.values;
  const e = state.errors;
  const [channel, setChannel] = useState(v.channel || "email");
  const val = (k: string, fallback = "") => v[k] ?? fallback;

  const foundPlatforms = SOCIAL_PLATFORMS.filter((p) => found.socials[p]);
  const missingPlatforms = SOCIAL_PLATFORMS.filter((p) => !found.socials[p]);
  const nothingFound = !found.website && !foundPlatforms.length;

  const siteHint = !found.website
    ? undefined
    : found.website_blocked
      ? "Found by web search. This site blocks automated visits, so please check it's yours. We may only be able to read part of it."
      : found.website_checked
        ? found.website_source === "you"
          ? "We opened it and could read it."
          : "We opened it and it's yours."
        : "Found by web search. Please check it's yours.";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="name" value={found.name} />

      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        {nothingFound ? (
          <>
            <h2 className="text-lg font-semibold">We couldn&apos;t find {found.name} online</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No problem. Add your website below and we&apos;ll take it from there.</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">We found {found.name}</h2>
            {found.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{found.description}</p>}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Check the details below. Change anything that&apos;s wrong.</p>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          {found.alternatives.length > 0 && <span className="text-zinc-500">Not you? Did you mean</span>}
          {found.alternatives.map((a) => (
            <button key={a.website} type="button" disabled={searching} onClick={() => onRetry(a.name, a.website)} className="rounded-full border border-zinc-300 px-3 py-1 hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700">
              {a.name} · {new URL(a.website).hostname.replace(/^www\./, "")}
            </button>
          ))}
          <button type="button" onClick={onBack} className="text-zinc-500 underline-offset-2 hover:underline">
            Search again
          </button>
          {searching && <span className="text-zinc-500">Looking that one up…</span>}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Your brand</h2>
        <Field label="Website" htmlFor="website" error={e.website ?? (!found.website ? "We couldn't find your website. Please add it, so we can learn your style." : undefined)} hint={siteHint}>
          <input id="website" name="website" defaultValue={val("website", found.website ?? "")} placeholder="yourbrand.com" className={inputClass} inputMode="url" />
        </Field>
        {foundPlatforms.map((p) => (
          <Field key={p} label={LABELS[p]} htmlFor={`social_${p}`} error={e[`social_${p}`]} hint={found.socials[p]!.source === "site" ? "Linked from your website." : "Found by web search. Please check it's yours, or clear it."}>
            <input id={`social_${p}`} name={`social_${p}`} defaultValue={val(`social_${p}`, `@${found.socials[p]!.handle}`)} className={inputClass} />
          </Field>
        ))}
        {missingPlatforms.length > 0 && (
          <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" open={missingPlatforms.some((p) => e[`social_${p}`])}>
            <summary className="cursor-pointer text-sm font-medium">Add an account we didn&apos;t find (optional): {missingPlatforms.map((p) => LABELS[p]).join(", ")}</summary>
            <div className="mt-3 flex flex-col gap-3">
              {missingPlatforms.map((p) => (
                <Field key={p} label={LABELS[p]} htmlFor={`social_${p}`} error={e[`social_${p}`]}>
                  <input id={`social_${p}`} name={`social_${p}`} defaultValue={val(`social_${p}`)} placeholder="@yourbrand" className={inputClass} />
                </Field>
              ))}
            </div>
          </details>
        )}
        <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800" open={!!(e.extra_urls || v.instagram_text || v.extra_urls)}>
          <summary className="cursor-pointer text-sm font-medium">Help us learn your voice (optional)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Instagram bio and a few recent captions" htmlFor="instagram_text" hint="Paste them in. We can't read Instagram posts automatically yet.">
              <textarea id="instagram_text" name="instagram_text" defaultValue={val("instagram_text")} rows={4} className={inputClass} />
            </Field>
            <Field label="Other pages to read" htmlFor="extra_urls" error={e.extra_urls} hint="One web address per line, e.g. your lookbook or a brand you watch.">
              <textarea id="extra_urls" name="extra_urls" defaultValue={val("extra_urls")} rows={2} className={inputClass} />
            </Field>
          </div>
        </details>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Where to send your trend digest</h2>
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
          <input id="email" name="email" type="email" defaultValue={val("email")} className={inputClass} autoComplete="email" />
        </Field>
        {channel === "slack" && (
          <Field label="Slack webhook link" htmlFor="slack_webhook" error={e.slack_webhook} hint="In Slack: Apps → Incoming Webhooks → Add to a channel, then copy the link.">
            <input id="slack_webhook" name="slack_webhook" defaultValue={val("slack_webhook")} placeholder="https://hooks.slack.com/services/…" className={inputClass} />
          </Field>
        )}
        <Field label="How often" htmlFor="frequency">
          <select id="frequency" name="frequency" defaultValue={val("frequency", "weekly")} className={inputClass}>
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
