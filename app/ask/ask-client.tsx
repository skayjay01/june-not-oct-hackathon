"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardEvent, DashboardSpec, TrendItem, Widget } from "@/lib/contracts";
import { Button, inputClass } from "@/components/form";
import { WidgetCard } from "@/components/dashboard/widgets";
import { WeightsEditor, type Preset, type WeightValues } from "@/components/weights-editor";
import { saveWeights } from "@/app/brands/[id]/settings/actions";
import { loadEvidence, loadWeights, rerank } from "./actions";

type Brand = { id: string; name: string };

type View = {
  question: string;
  title: string;
  summary: string;
  widgets: Widget[];
  pendingIds: string[];
  spec: DashboardSpec | null;
  notice: DashboardSpec["notice"] | null;
  error: string | null;
  cached: boolean;
  seconds: number | null;
};

const empty = (question: string): View => ({ question, title: "", summary: "", widgets: [], pendingIds: [], spec: null, notice: null, error: null, cached: false, seconds: null });

export function AskClient({
  brands,
  initialBrand,
  initialQuestion,
  examples,
  presets,
}: {
  brands: Brand[];
  initialBrand: string;
  initialQuestion: string;
  examples: string[];
  presets: Preset[];
}) {
  const [brandId, setBrandId] = useState(initialBrand);
  const [question, setQuestion] = useState(initialQuestion);
  const [followUp, setFollowUp] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [history, setHistory] = useState<View[]>([]);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<{ label: string; items: TrendItem[] | null } | null>(null);
  const started = useRef(false);

  const ask = useCallback(
    async (q: string, previous?: DashboardSpec) => {
      if (!q.trim() || !brandId) return;
      setBusy(true);
      const t0 = performance.now();
      let v = empty(q.trim());
      setView(v);
      const url = new URL(window.location.href);
      url.searchParams.set("brand", brandId);
      url.searchParams.set("q", previous ? previous.question : q.trim());
      window.history.replaceState(null, "", url);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brandId, question: q.trim(), previous }),
        });
        if (!res.ok || !res.body) {
          const msg = (await res.json().catch(() => null))?.error ?? "Something went wrong. Please try again.";
          setView({ ...v, error: msg });
          return;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            v = apply(v, JSON.parse(line) as DashboardEvent);
            setView(v);
          }
        }
        setView({ ...v, seconds: Math.round((performance.now() - t0) / 100) / 10 });
      } catch {
        setView({ ...v, error: "Lost the connection. Please try again." });
      } finally {
        setBusy(false);
      }
    },
    [brandId],
  );

  // Arriving from the home page with ?q=…: start right away.
  useEffect(() => {
    if (!started.current && initialQuestion && initialBrand) {
      started.current = true;
      void ask(initialQuestion);
    }
  }, [ask, initialBrand, initialQuestion]);

  const pick = useCallback(
    async (ids: number[], label: string) => {
      setEvidence({ label, items: null });
      setEvidence({ label, items: await loadEvidence(brandId, ids) });
    },
    [brandId],
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setHistory([]);
          void ask(question);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="brand" className="text-zinc-500">
            For
          </label>
          <select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className={`${inputClass} w-auto py-1.5`}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          aria-label="Your trend question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={500}
          rows={2}
          placeholder="Which colors are rising in summer dresses under $50?"
          className={`${inputClass} text-lg`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" pending={busy} disabled={!question.trim()}>
            {busy ? "Building…" : "Ask"}
          </Button>
          {!view &&
            examples.map((ex) => (
              <button key={ex} type="button" onClick={() => {
                  setQuestion(ex);
                  setHistory([]);
                  void ask(ex);
                }} className="rounded-full border border-zinc-300 px-3 py-1 text-left text-sm hover:border-zinc-500 dark:border-zinc-700">
                {ex}
              </button>
            ))}
        </div>
      </form>

      {view && <Dashboard view={view} busy={busy} onPick={pick} />}

      {view?.spec && !busy && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!followUp.trim()) return;
            setHistory((h) => [...h, view]);
            void ask(followUp, view.spec!);
            setFollowUp("");
          }}
          className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
        >
          <label htmlFor="followup" className="text-sm font-medium">
            Refine this
          </label>
          <div className="flex gap-2">
            <input id="followup" value={followUp} onChange={(e) => setFollowUp(e.target.value)} maxLength={500} placeholder="Only under $50 · Just knitwear · Compare with last year…" className={inputClass} />
            <Button type="submit" variant="secondary" disabled={!followUp.trim()}>
              Update
            </Button>
          </div>
          {history.length > 0 && (
            <button type="button" onClick={() => {
                setView(history[history.length - 1]);
                setHistory((h) => h.slice(0, -1));
              }} className="self-start text-sm text-zinc-500 underline-offset-2 hover:underline">
              ← Back to the previous dashboard
            </button>
          )}
        </form>
      )}

      {view?.spec && !busy && (
        <RerankPanel
          key={`${brandId}:${view.spec.question}`}
          brandId={brandId}
          presets={presets}
          onRanked={(spec) => setView((v) => (v ? { ...v, spec, title: spec.title, summary: spec.summary, widgets: spec.widgets } : v))}
          spec={view.spec}
        />
      )}

      {evidence && <EvidencePanel label={evidence.label} items={evidence.items} onClose={() => setEvidence(null)} />}
    </div>
  );
}

function apply(v: View, e: DashboardEvent): View {
  switch (e.type) {
    case "plan":
      return { ...v, title: e.title, pendingIds: e.widget_ids };
    case "widget":
      return { ...v, widgets: [...v.widgets.filter((w) => w.id !== e.widget.id), e.widget], pendingIds: v.pendingIds.filter((id) => id !== e.widget.id) };
    case "summary":
      return { ...v, summary: e.summary };
    case "done":
      return { ...v, spec: e.spec, title: e.spec.title, summary: e.spec.summary, widgets: e.spec.widgets, pendingIds: [], notice: e.spec.notice ?? null, cached: e.cached };
    case "error":
      return { ...v, error: e.message, pendingIds: [] };
  }
}

function Dashboard({ view, busy, onPick }: { view: View; busy: boolean; onPick: (ids: number[], label: string) => void }) {
  return (
    <div className="flex flex-col gap-4" aria-live="polite" aria-busy={busy}>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{view.title || (busy ? "Reading your question…" : view.question)}</h2>
        {view.summary ? <p className="text-zinc-700 dark:text-zinc-300">{view.summary}</p> : busy && view.widgets.length > 0 && <p className="text-zinc-400">Writing the summary…</p>}
        {view.seconds !== null && !view.error && (
          <p className="text-xs text-zinc-400">{view.cached ? `Saved answer · ${view.seconds}s` : `Built in ${view.seconds}s`}</p>
        )}
      </div>
      {view.error && <p className="text-red-700 dark:text-red-400">{view.error}</p>}
      {view.notice && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {view.notice.message}
          {view.notice.suggestion && <p className="mt-1">Try: “{view.notice.suggestion}”</p>}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {view.widgets.map((w) => (
          <div key={w.id} className={w.chart === "image_grid" || w.chart === "trend_line" ? "md:col-span-2" : ""}>
            <WidgetCard widget={w} onPick={onPick} />
          </div>
        ))}
        {view.pendingIds.map((id) => (
          <div key={id} className="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({ label, items, onClose }: { label: string; items: TrendItem[] | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Evidence: ${label}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-white p-5 shadow-xl dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Behind this chart</p>
            <h3 className="text-lg font-semibold">{label}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
            ✕
          </button>
        </div>
        {!items ? (
          <p className="text-zinc-500">Loading…</p>
        ) : !items.length ? (
          <p className="text-zinc-500">No records to show.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3">
                {i.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote store images, any host
                  <img src={i.image_url} alt="" className="size-20 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800" loading="lazy" />
                ) : (
                  <div className="size-20 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  {i.link ? (
                    <a href={i.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {i.title}
                    </a>
                  ) : (
                    <span className="font-medium">{i.title}</span>
                  )}
                  <span className="text-zinc-500">
                    {[i.price != null ? `${i.price} ${i.currency ?? ""}` : "", i.source.replace(/_/g, " "), (i.published_at ?? i.collected_at).slice(0, 10)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

// Re-rank the current dashboard under different weights, with no AI call (US-007).
function RerankPanel({ brandId, spec, presets, onRanked }: { brandId: string; spec: DashboardSpec; presets: Preset[]; onRanked: (s: DashboardSpec) => void }) {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState<WeightValues | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const base = useRef(spec);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function openPanel() {
    setOpen(true);
    if (!w) {
      const saved = await loadWeights(brandId);
      setPreset(saved.preset);
      setW({ price_fit: saved.price_fit, social_buzz: saved.social_buzz, growth_speed: saved.growth_speed, competitor_adoption: saved.competitor_adoption, style_fit: saved.style_fit });
    }
  }

  function change(next: WeightValues, p: string | null) {
    setW(next);
    setPreset(p);
    setStatus("Re-ranking…");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const t0 = performance.now();
      onRanked(await rerank(brandId, base.current, next));
      setStatus(`Re-ranked in ${Math.round(performance.now() - t0)} ms, no AI call.`);
    }, 350);
  }

  if (!open) {
    return (
      <button type="button" onClick={openPanel} className="self-start text-sm text-zinc-500 underline-offset-2 hover:underline">
        Adjust what matters (re-rank without asking again)
      </button>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="font-semibold">What matters most</h3>
      {w ? <WeightsEditor value={w} presets={presets} preset={preset} onChange={change} /> : <p className="text-sm text-zinc-500">Loading…</p>}
      <div className="flex flex-wrap items-center gap-3">
        {w && (
          <Button type="button" variant="secondary" onClick={async () => setStatus((await saveWeights(brandId, w, preset)).message)}>
            Save as this brand&apos;s weights
          </Button>
        )}
        {status && <p className="text-sm text-zinc-500">{status}</p>}
      </div>
    </section>
  );
}
