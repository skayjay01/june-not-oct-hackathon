import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WEIGHT_DIMENSIONS } from "@/lib/contracts";
import { db } from "@/lib/db/server";
import { DEFAULT_WEIGHTS } from "@/lib/engine/build-digest";
import { LICENSED_SOURCES, licensedCounts } from "@/lib/sources/licensed";
import { PartnerStrip } from "@/components/partner-strip";
import type { WeightValues } from "@/components/weights-editor";
import { loadPresets } from "@/app/ask/data";
import { deleteBrand, disconnect, saveDelivery, saveWeights, uploadLicensed } from "./actions";
import { DeleteBrand, DeliveryForm, LicensedSource, WeightsForm } from "./forms";

export const metadata = { title: "Settings · Ask-a-Trend" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SettingsPage({ params }: PageProps<"/brands/[id]/settings">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Settings params={params} />
      </Suspense>
    </main>
  );
}

async function Settings({ params }: Pick<PageProps<"/brands/[id]/settings">, "params">) {
  const { id } = await params;
  await connection();
  if (!UUID.test(id)) notFound();
  const [{ data: brand }, { data: weights }, presets, counts] = await Promise.all([
    db().from("brands").select("id, name, email, slack_webhook_url, digest_channel, digest_frequency").eq("id", id).maybeSingle(),
    db().from("weights").select("*").eq("brand_id", id).maybeSingle(),
    loadPresets(),
    licensedCounts(id),
  ]);
  if (!brand) notFound();
  const w = (weights ?? DEFAULT_WEIGHTS) as WeightValues & { preset: string | null };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/brands/${id}`} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← {brand.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-semibold">What matters most</h2>
          <p className="text-sm text-zinc-500">How much each signal counts when we rank trends for your digests and dashboards. Always totals 100%.</p>
        </div>
        <WeightsForm
          initial={Object.fromEntries(WEIGHT_DIMENSIONS.map((d) => [d, w[d]])) as WeightValues}
          initialPreset={w.preset}
          presets={presets}
          save={saveWeights.bind(null, id)}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-xl font-semibold">Digest delivery</h2>
        <DeliveryForm
          initial={{ channel: brand.digest_channel, frequency: brand.digest_frequency, email: brand.email ?? "", slack: brand.slack_webhook_url ?? "" }}
          save={saveDelivery.bind(null, id)}
        />
      </section>

      <section className="flex flex-col gap-1 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-xl font-semibold">Your paid trend sources</h2>
        <p className="text-sm text-zinc-500">
          Already subscribe to one of these? Upload an export (CSV with a title column, plus any of category, color, price, link, image,
          date, growth). It&apos;s added to your digests and dashboards and is visible to your brand only. We never share or resell it.
        </p>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {LICENSED_SOURCES.map((s) => (
            <LicensedSource
              key={s.key}
              name={s.name}
              api={s.api}
              count={counts[s.key] ?? 0}
              upload={uploadLicensed.bind(null, id, s.key)}
              disconnect={disconnect.bind(null, id, s.key)}
            />
          ))}
        </ul>
      </section>

      <PartnerStrip />

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">Delete brand</h2>
          <p className="text-sm text-zinc-500">
            Removes the brand with its profile, digests, feedback, saved answers and uploaded licensed data. This can&apos;t be undone.
          </p>
        </div>
        <DeleteBrand name={brand.name} remove={deleteBrand.bind(null, id)} />
      </section>
    </>
  );
}
