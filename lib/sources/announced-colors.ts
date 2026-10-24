import { readJson } from "./curation";
import type { TrendRow } from "./store-products";

// Connector "announced_colors": the colors in Blair's colors.json that carry a public source
// (Pantone Color of the Year, WGSN × Coloro key colors, press coverage), one trend row each.
// The title names who announced it, so the evidence panel shows where the color came from.

type Color = { id: string; name: string; source?: string };

export async function collectAnnouncedColors(now = new Date()): Promise<TrendRow[]> {
  const { colors } = await readJson<{ colors: Color[] }>("colors.json");
  return colors
    .filter((c) => c.source)
    .map((c) => ({
      source: "announced_colors",
      source_item_id: c.id,
      brand_id: null,
      type: "color",
      title: `${c.name} — ${c.source}`,
      category: null,
      attributes: { colors: [c.id] },
      price: null,
      currency: null,
      image_url: null,
      link: null,
      metrics: {},
      published_at: null,
      collected_at: now.toISOString(),
    }));
}
