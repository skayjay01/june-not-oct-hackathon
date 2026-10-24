import "server-only";
import nodemailer from "nodemailer";
import type { DigestSpec } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { renderEmail, renderSlack, renderText } from "./render";

// Contract function (tasks/build-plan.md): sendDigest(brandId, digest, channel) delivers by
// email (Gmail or Resend), Slack (the brand's incoming webhook) or WhatsApp (Meta's test number, demo only).
//
// Server-only env vars:
//   GMAIL_ADDRESS, GMAIL_APP_PASSWORD   email from that Gmail account (an app password, not the login
//                                       password); used instead of Resend when both are set
//   RESEND_API_KEY, DIGEST_FROM_EMAIL   email; without a verified domain Resend only delivers to the
//                                       Resend account's own address, from onboarding@resend.dev
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO   Meta Cloud API test number (≤5 recipients)

export type Channel = "email" | "slack" | "whatsapp";

export class DeliveryError extends Error {}

const TIMEOUT = AbortSignal.timeout.bind(AbortSignal, 15_000);

async function sendGmail(user: string, pass: string, to: string, mail: { subject: string; html: string; text: string }) {
  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass }, connectionTimeout: 15_000, socketTimeout: 15_000 });
  try {
    await transport.sendMail({ from: { name: "Ask-a-Trend", address: user }, to, ...mail });
  } catch (e) {
    throw new DeliveryError(`Email failed (Gmail): ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
  }
}

async function sendEmail(to: string, d: DigestSpec & { id: string }, brandName: string) {
  const { subject, html, text } = renderEmail(d, brandName);
  const { GMAIL_ADDRESS: gmail, GMAIL_APP_PASSWORD: gmailPass } = process.env;
  if (gmail && gmailPass) return sendGmail(gmail, gmailPass, to, { subject, html, text });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new DeliveryError("Email isn't set up yet: set GMAIL_ADDRESS and GMAIL_APP_PASSWORD, or RESEND_API_KEY.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.DIGEST_FROM_EMAIL || "Ask-a-Trend <onboarding@resend.dev>", to: [to], subject, html, text }),
    signal: TIMEOUT(),
  });
  if (!res.ok) throw new DeliveryError(`Email failed (Resend ${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function sendSlack(webhook: string, d: DigestSpec & { id: string }, brandName: string) {
  if (!webhook.startsWith("https://hooks.slack.com/")) throw new DeliveryError("This brand has no valid Slack webhook link.");
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(renderSlack(d, brandName)),
    signal: TIMEOUT(),
  });
  if (!res.ok) throw new DeliveryError(`Slack failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function sendWhatsApp(d: DigestSpec & { id: string }, brandName: string) {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: from, WHATSAPP_TO: to } = process.env;
  if (!token || !from || !to) throw new DeliveryError("WhatsApp isn't set up yet: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TO are needed.");
  const res = await fetch(`https://graph.facebook.com/v21.0/${from}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: renderText(d, brandName).slice(0, 4000) } }),
    signal: TIMEOUT(),
  });
  if (!res.ok) throw new DeliveryError(`WhatsApp failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function sendDigest(brandId: string, digest: DigestSpec, channel: Channel): Promise<void> {
  if (!digest.id) throw new DeliveryError("Digest has no id; save it first (buildDigest does).");
  const d = digest as DigestSpec & { id: string };
  const { data: brand, error } = await db().from("brands").select("name, email, slack_webhook_url").eq("id", brandId).single();
  if (error) throw error;

  if (channel === "email") {
    if (!brand.email) throw new DeliveryError("This brand has no email address.");
    await sendEmail(brand.email, d, brand.name);
  } else if (channel === "slack") {
    await sendSlack(brand.slack_webhook_url ?? "", d, brand.name);
  } else {
    await sendWhatsApp(d, brand.name);
  }

  const { error: saveError } = await db().from("digests").update({ channel, sent_at: new Date().toISOString() }).eq("id", d.id);
  if (saveError) throw saveError;
}
