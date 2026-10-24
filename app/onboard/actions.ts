"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/server";
import { runOnboarding } from "@/lib/sources/onboard-brand";
import { rememberBrand } from "@/app/current-brand";

export type OnboardState = { errors: Record<string, string>; values: Record<string, string> };

const CHANNELS = ["email", "slack", "whatsapp"] as const;
const FREQUENCIES = ["daily", "weekly"] as const;

function httpUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function createBrand(_prev: OnboardState, form: FormData): Promise<OnboardState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const values = Object.fromEntries(
    ["name", "website", "instagram", "instagram_text", "extra_urls", "email", "slack_webhook", "channel", "frequency"].map((k) => [k, get(k)]),
  );
  const errors: Record<string, string> = {};

  const website = httpUrl(values.website);
  if (!values.name) errors.name = "Enter your brand name.";
  if (!website) errors.website = "Enter your website address, like yourbrand.com.";

  const instagram = values.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) errors.instagram = "That doesn't look like an Instagram handle.";

  const extraLines = values.extra_urls.split(/\s+/).filter(Boolean);
  const extraUrls = extraLines.map(httpUrl);
  if (extraUrls.some((u) => !u)) errors.extra_urls = "One of these isn't a web address. Put one per line.";

  const channel = CHANNELS.find((c) => c === values.channel) ?? "email";
  const frequency = FREQUENCIES.find((f) => f === values.frequency) ?? "weekly";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Enter a valid email address.";
  if (channel === "email" && !values.email) errors.email = "Enter the email the digest should go to.";
  if (values.slack_webhook && !values.slack_webhook.startsWith("https://hooks.slack.com/")) {
    errors.slack_webhook = "Slack webhook links start with https://hooks.slack.com/";
  }
  if (channel === "slack" && !values.slack_webhook) errors.slack_webhook = "Paste the Slack webhook link the digest should post to.";

  if (Object.keys(errors).length) return { errors, values };

  const { data: brand, error } = await db()
    .from("brands")
    .insert({
      name: values.name,
      website_url: website,
      instagram_handle: instagram || null,
      extra_urls: extraUrls,
      email: values.email || null,
      slack_webhook_url: values.slack_webhook || null,
      digest_channel: channel,
      digest_frequency: frequency,
      crawl_status: "running",
    })
    .select("id")
    .single();
  if (error) return { errors: { form: `Couldn't save your brand: ${error.message}` }, values };

  // Instagram text pasted by the founder (until the official API is approved).
  if (values.instagram_text) {
    await db().from("crawl_pages").insert({
      brand_id: brand.id,
      url: instagram ? `https://www.instagram.com/${instagram}/` : "instagram:pasted",
      kind: "ig_caption",
      text: values.instagram_text.slice(0, 20_000),
    });
  }

  after(() => runOnboarding(brand.id));
  await rememberBrand(brand.id);
  redirect(`/brands/${brand.id}`);
}
