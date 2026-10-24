"use client";

import { WEIGHT_DIMENSIONS, type WeightDimension } from "@/lib/contracts";

// Five ranking weights that always total 100 (US-007, FR-15). Moving one slider spreads the
// difference over the others in proportion, so the total never drifts.

export type WeightValues = Record<WeightDimension, number>;
export type Preset = WeightValues & { id: string; label: string; reason: string };

export const DIMENSION_INFO: Record<WeightDimension, { label: string; reason: string }> = {
  price_fit: { label: "Price fit", reason: "Is it selling at your price point?" },
  social_buzz: { label: "Social buzz", reason: "How much people search for and talk about it." },
  growth_speed: { label: "Growth speed", reason: "How fast new listings and searches are rising." },
  competitor_adoption: { label: "Competitor adoption", reason: "How many stores and houses already carry it." },
  style_fit: { label: "Style fit", reason: "How closely it matches your style profile." },
};

export function rebalance(w: WeightValues, dim: WeightDimension, value: number): WeightValues {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = WEIGHT_DIMENSIONS.filter((d) => d !== dim);
  const rest = others.reduce((s, d) => s + w[d], 0);
  const next = { ...w, [dim]: v };
  const target = 100 - v;
  let assigned = 0;
  others.forEach((d, i) => {
    const share = rest > 0 ? (w[d] / rest) * target : target / others.length;
    next[d] = i === others.length - 1 ? target - assigned : Math.round(share);
    assigned += next[d];
  });
  // rounding can push the last one below zero; settle it on the largest
  if (next[others[others.length - 1]] < 0) {
    const big = others.reduce((a, b) => (next[a] >= next[b] ? a : b));
    next[big] += next[others[others.length - 1]];
    next[others[others.length - 1]] = 0;
  }
  return next;
}

export function WeightsEditor({
  value,
  presets,
  preset,
  onChange,
}: {
  value: WeightValues;
  presets: Preset[];
  preset: string | null;
  onChange: (w: WeightValues, preset: string | null) => void;
}) {
  const active = presets.find((p) => p.id === preset);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === preset}
            onClick={() => onChange(Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, p[d]])) as WeightValues, p.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              p.id === preset ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {active && <p className="text-sm text-zinc-500">{active.reason}</p>}
      <div className="flex flex-col gap-3">
        {WEIGHT_DIMENSIONS.map((d) => (
          <label key={d} className="flex flex-col gap-1">
            <span className="flex justify-between text-sm">
              <span>
                {DIMENSION_INFO[d].label} <span className="text-zinc-500">· {DIMENSION_INFO[d].reason}</span>
              </span>
              <span className="tabular-nums">{value[d]}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={value[d]}
              onChange={(e) => onChange(rebalance(value, d, Number(e.target.value)), null)}
              className="accent-zinc-900 dark:accent-zinc-100"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
