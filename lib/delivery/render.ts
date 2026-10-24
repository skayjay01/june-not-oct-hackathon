import "server-only";
import type { DigestSpec, TrendItem } from "@/lib/contracts";
import { digestUrl, voteUrl } from "./links";

// One digest, three shapes: email (HTML + plain text), Slack (Block Kit) and WhatsApp (plain text).
// Every example is a real product with its source link (FR-3).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const priceOf = (i: TrendItem) => {
  if (i.price == null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: i.currency || "USD", maximumFractionDigits: 0 }).format(i.price);
  } catch {
    return `${i.price} ${i.currency ?? ""}`.trim();
  }
};

const storeOf = (i: TrendItem) => {
  try {
    return i.link ? new URL(i.link).host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export function renderEmail(d: DigestSpec & { id: string }, brandName: string) {
  const subject = `${brandName} trend digest: ${d.headline}`;
  const elements = d.elements
    .map((e) => {
      const examples = e.examples
        .map(
          (i) => `
          <td style="width:25%;vertical-align:top;padding:4px">
            <a href="${esc(i.link ?? "#")}" style="text-decoration:none;color:#18181b">
              ${i.image_url ? `<img src="${esc(i.image_url)}" alt="${esc(i.title ?? "")}" width="120" style="width:100%;max-width:140px;border-radius:6px;display:block">` : ""}
              <div style="font-size:12px;line-height:16px;margin-top:4px">${esc(i.title ?? "")}</div>
              <div style="font-size:12px;color:#71717a">${esc([priceOf(i), storeOf(i)].filter(Boolean).join(" · "))}</div>
            </a>
          </td>`,
        )
        .join("");
      return `
      <tr><td style="padding:20px 0 4px;font-size:18px;font-weight:600">${esc(e.name)}</td></tr>
      <tr><td style="font-size:14px;line-height:20px;color:#3f3f46">${esc(e.reason)}<br><em>Fits your brand because</em> ${esc(e.fits_because)}</td></tr>
      <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${examples}</tr></table></td></tr>
      <tr><td style="font-size:14px;padding-top:6px">
        <a href="${voteUrl(d.id, e.key, 1)}" style="text-decoration:none">👍 More like this</a> &nbsp;·&nbsp;
        <a href="${voteUrl(d.id, e.key, -1)}" style="text-decoration:none">👎 Not for us</a>
      </td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px;padding:24px" cellspacing="0" cellpadding="0">
      <tr><td style="font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.05em">Ask-a-Trend · ${esc(brandName)} · ${esc(d.date)}</td></tr>
      <tr><td style="padding-top:8px;font-size:22px;font-weight:700">${esc(d.headline)}</td></tr>
      ${elements}
      <tr><td style="padding-top:24px;font-size:12px;color:#71717a"><a href="${digestUrl(d.id)}">View in your browser</a>. Examples are real products from public store listings.</td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, html, text: renderText(d, brandName) };
}

export function renderText(d: DigestSpec & { id: string }, brandName: string) {
  const parts = [`${brandName} trend digest (${d.date})`, d.headline, ""];
  for (const e of d.elements) {
    parts.push(`*${e.name}*`, e.reason, `Fits your brand because ${e.fits_because}`);
    for (const i of e.examples) parts.push(`- ${i.title}${priceOf(i) ? ` (${priceOf(i)})` : ""}: ${i.link ?? ""}`);
    parts.push(`👍 ${voteUrl(d.id, e.key, 1)}`, `👎 ${voteUrl(d.id, e.key, -1)}`, "");
  }
  parts.push(`Full digest: ${digestUrl(d.id)}`);
  return parts.join("\n");
}

export function renderSlack(d: DigestSpec & { id: string }, brandName: string) {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: d.headline.slice(0, 150) } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Ask-a-Trend · ${brandName} · ${d.date}` }] },
  ];
  for (const e of d.elements) {
    const cover = e.examples.find((i) => i.image_url);
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${e.name}*`,
            e.reason,
            `_Fits your brand because_ ${e.fits_because}`,
            e.examples.map((i) => `• <${i.link ?? digestUrl(d.id)}|${(i.title ?? "item").replace(/[<>|]/g, "")}>${priceOf(i) ? ` ${priceOf(i)}` : ""}`).join("\n"),
          ].join("\n"),
        },
        ...(cover ? { accessory: { type: "image", image_url: cover.image_url, alt_text: cover.title ?? e.name } } : {}),
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `<${voteUrl(d.id, e.key, 1)}|👍 More like this>   <${voteUrl(d.id, e.key, -1)}|👎 Not for us>` }] },
    );
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${digestUrl(d.id)}|View the full digest>` }] });
  return { text: `${brandName} trend digest: ${d.headline}`, blocks };
}
