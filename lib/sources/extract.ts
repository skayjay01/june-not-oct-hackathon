import * as cheerio from "cheerio";

// Text-only extraction (FR-1): we keep words, never analyze images.

const MAX_TEXT = 20_000;

export type PageText = {
  title: string;
  text: string;
  alts: string[];
  links: string[];
};

export function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  return clean($.root().text()).slice(0, MAX_TEXT);
}

export function extractPage(html: string, baseUrl: string): PageText {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, template").remove();

  const alts = [
    ...new Set(
      $("img[alt]")
        .map((_, el) => clean($(el).attr("alt") ?? ""))
        .get()
        .filter((a) => a.length > 2),
    ),
  ];

  const links = [
    ...new Set(
      $("a[href]")
        .map((_, el) => {
          try {
            return new URL($(el).attr("href")!, baseUrl).toString().split("#")[0];
          } catch {
            return "";
          }
        })
        .get()
        .filter(Boolean),
    ),
  ];

  // Prefer the main content; fall back to the whole body.
  const main = $("main").length ? $("main") : $("body");
  return {
    title: clean($("title").first().text()),
    text: clean(main.text()).slice(0, MAX_TEXT),
    alts,
    links,
  };
}

const ABOUT_PATTERN = /\/(pages\/)?(about|about-us|our-story|story|who-we-are|mission)(\/|$|\?)/i;

// Same-site links that look like an About / brand-story page.
export function findAboutLinks(links: string[], baseUrl: string): string[] {
  const host = new URL(baseUrl).host;
  return links.filter((l) => {
    try {
      const u = new URL(l);
      return u.host === host && ABOUT_PATTERN.test(u.pathname);
    } catch {
      return false;
    }
  });
}
