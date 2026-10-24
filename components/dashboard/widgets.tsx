"use client";

import type { Widget, WidgetRow } from "@/lib/contracts";

// The fixed widget set (FR-12). Every clickable element opens the evidence panel with the real
// items behind it (US-009) through onPick(item_ids, label).

export type OnPick = (itemIds: number[], label: string) => void;

const fmt = (v: number, unit?: Widget["unit"]) =>
  unit === "percent" ? `${Math.round(v)}%` : unit === "usd" ? `$${Math.round(v).toLocaleString()}` : Math.round(v).toLocaleString();

const SERIES_COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed"];

function clickable(row: WidgetRow, onPick: OnPick) {
  return row.item_ids?.length ? { onClick: () => onPick(row.item_ids!, row.label), role: "button" as const, tabIndex: 0 } : {};
}

export function WidgetCard({ widget, onPick }: { widget: Widget; onPick: OnPick }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-semibold">{widget.title}</h3>
        <p className="text-sm text-zinc-500">{widget.caption}</p>
      </div>
      <WidgetBody widget={widget} onPick={onPick} />
      <p className="text-xs text-zinc-400">
        {[widget.source && `Source: ${widget.source}`, widget.date_range && `${widget.date_range.from} – ${widget.date_range.to}`].filter(Boolean).join(" · ")}
      </p>
    </section>
  );
}

function WidgetBody({ widget, onPick }: { widget: Widget; onPick: OnPick }) {
  const rows = widget.rows ?? [];
  if (!rows.length) return <p className="text-sm text-zinc-500">No data for this one.</p>;
  switch (widget.chart) {
    case "ranked_bar":
      return <RankedBar rows={rows} unit={widget.unit} onPick={onPick} />;
    case "color_swatches":
      return <Swatches rows={rows} unit={widget.unit} onPick={onPick} />;
    case "trend_line":
      return <TrendLine rows={rows} onPick={onPick} />;
    case "image_grid":
      return <ImageGrid rows={rows} onPick={onPick} />;
    case "big_number":
      return <BigNumber rows={rows} unit={widget.unit} onPick={onPick} />;
    case "comparison":
      return <Comparison rows={rows} unit={widget.unit} onPick={onPick} />;
  }
}

function RankedBar({ rows, unit, onPick }: { rows: WidgetRow[]; unit?: Widget["unit"]; onPick: OnPick }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} {...clickable(r, onPick)} className="group flex cursor-pointer flex-col gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate group-hover:underline">{r.label}</span>
            <span className="tabular-nums text-zinc-500">{fmt(r.value, unit)}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2 rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Swatches({ rows, unit, onPick }: { rows: WidgetRow[]; unit?: Widget["unit"]; onPick: OnPick }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <li key={r.label} {...clickable(r, onPick)} className="flex cursor-pointer items-center gap-3 rounded-lg p-1 hover:bg-zinc-50 dark:hover:bg-zinc-900">
          <span className="size-10 shrink-0 rounded-full border border-black/10" style={{ background: r.hex ?? "#d4d4d8" }} />
          <span className="flex flex-col">
            <span className="text-sm">{r.label}</span>
            <span className="text-xs tabular-nums text-zinc-500">{fmt(r.value, unit)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function TrendLine({ rows, onPick }: { rows: WidgetRow[]; onPick: OnPick }) {
  const W = 560;
  const H = 200;
  const pad = { l: 28, r: 8, t: 8, b: 22 };
  const dated = rows.filter((r) => r.date);
  const dates = [...new Set(dated.map((r) => r.date!))].sort();
  const series = [...new Set(dated.map((r) => r.label))];
  const max = Math.max(...dated.map((r) => r.value), 1);
  const x = (d: string) => pad.l + (dates.length > 1 ? (dates.indexOf(d) / (dates.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend line">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="stroke-zinc-200 dark:stroke-zinc-800" />
            <text x={pad.l - 4} y={y(max * f) + 4} textAnchor="end" className="fill-zinc-400 text-[10px]">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {[dates[0], dates[dates.length - 1]].filter(Boolean).map((d, i) => (
          <text key={d} x={x(d!)} y={H - 4} textAnchor={i ? "end" : "start"} className="fill-zinc-400 text-[10px]">
            {d}
          </text>
        ))}
        {series.map((s, si) => {
          const pts = dated.filter((r) => r.label === s).sort((a, b) => a.date!.localeCompare(b.date!));
          return (
            <g key={s}>
              <polyline fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={2} points={pts.map((p) => `${x(p.date!)},${y(p.value)}`).join(" ")} />
              {pts.map((p) => (
                <circle key={p.date} cx={x(p.date!)} cy={y(p.value)} r={3} fill={SERIES_COLORS[si % SERIES_COLORS.length]} className="cursor-pointer" onClick={() => p.item_ids && onPick(p.item_ids, `${s}, ${p.date}`)}>
                  <title>{`${s} · ${p.date}: ${p.value}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-3 text-xs">
        {series.map((s, si) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImageGrid({ rows, onPick }: { rows: WidgetRow[]; onPick: OnPick }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} {...clickable(r, onPick)} className="flex cursor-pointer flex-col gap-1 hover:opacity-80">
          {r.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote store images, any host
            <img src={r.image_url} alt={r.label} loading="lazy" className="aspect-[4/5] w-full rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" />
          ) : (
            <div className="aspect-[4/5] w-full rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          )}
          <span className="text-sm leading-tight">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function BigNumber({ rows, unit, onPick }: { rows: WidgetRow[]; unit?: Widget["unit"]; onPick: OnPick }) {
  const [main, ...rest] = rows;
  return (
    <div className="flex flex-col gap-2">
      <div {...clickable(main, onPick)} className="cursor-pointer">
        <p className="text-5xl font-semibold tabular-nums tracking-tight">{fmt(main.value, unit)}</p>
        <p className="text-sm text-zinc-500">{main.label}</p>
      </div>
      {rest.map((r) => (
        <p key={r.label} {...clickable(r, onPick)} className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium tabular-nums">{fmt(r.value, r.label.toLowerCase().includes("store") ? "count" : unit)}</span> {r.label.toLowerCase()}
        </p>
      ))}
    </div>
  );
}

function Comparison({ rows, unit, onPick }: { rows: WidgetRow[]; unit?: Widget["unit"]; onPick: OnPick }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="grid grid-cols-2 gap-3">
      {rows.map((r) => (
        <div key={r.label} {...clickable(r, onPick)} className="flex cursor-pointer flex-col gap-2 rounded-lg bg-zinc-50 p-3 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800">
          <p className="text-sm">{r.label}</p>
          <p className="text-3xl font-semibold tabular-nums">{fmt(r.value, unit)}</p>
          <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
