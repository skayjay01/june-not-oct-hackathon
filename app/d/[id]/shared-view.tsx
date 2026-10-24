"use client";

import { useCallback, useState } from "react";
import type { DashboardSpec, TrendItem } from "@/lib/contracts";
import { Dashboard, EvidencePanel, empty } from "@/app/ask/ask-client";
import { loadEvidence } from "@/app/ask/actions";

// A saved dashboard, replayed as stored: no AI call, evidence panel still works (US-010).
export function SharedView({ brandId, spec }: { brandId: string; spec: DashboardSpec }) {
  const [evidence, setEvidence] = useState<{ label: string; items: TrendItem[] | null } | null>(null);
  const pick = useCallback(
    async (ids: number[], label: string) => {
      setEvidence({ label, items: null });
      setEvidence({ label, items: await loadEvidence(brandId, ids) });
    },
    [brandId],
  );
  const view = { ...empty(spec.question), spec, title: spec.title, summary: spec.summary, widgets: spec.widgets, notice: spec.notice ?? null };
  return (
    <>
      <Dashboard view={view} busy={false} onPick={pick} />
      {evidence && <EvidencePanel label={evidence.label} items={evidence.items} onClose={() => setEvidence(null)} />}
    </>
  );
}
