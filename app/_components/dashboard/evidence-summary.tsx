import Link from "next/link";

import type { readDashboardEvidence } from "../../../lib/db/dashboard-queries";
import type { RecordedEnergy } from "../../../lib/domain/dashboard";
import {
  ZERO,
  compare,
  toFixed,
  type Decimal,
} from "../../../lib/domain/decimal";
import type { ScopeTotals } from "../../../lib/domain/emissions";
import type {
  projectTargetYear,
  readingAgainstTarget,
} from "../../../lib/domain/targets";
import { TARGET_COVERAGE_LABELS } from "../../../lib/validation/targets";
import { mwh, tonnes } from "./format";
import { GapCaveat } from "./gap-caveat";

/**
 * The three cards at the top of `/dashboard` — latest emissions, recorded
 * energy, nearest active target. Moved out of `app/dashboard/page.tsx` by
 * prompt 120.
 *
 * **A Server Component, and it fetches nothing.** Every figure arrives already
 * computed: the page reads the evidence and the pure functions in `lib/domain/`
 * derive it (AGENTS.md 6.2), which is why the props list is long. That is the
 * layering, not an accident of the split — a card that queried for its own figure
 * could produce a number the rest of the page disagrees with.
 *
 * The three rules the cards hold are the summary's rules everywhere on this
 * product: coverage travels with the figure (`GapCaveat`), biogenic and
 * outside-of-scopes are stated separately and are in no total, and a market-based
 * figure carries its method and its coverage and is never folded into the
 * location-based one.
 */

/** The target reading, as the page derives it. `null` where no active future
    target exists — which is a state, not a failure. */
export type TargetView = {
  figure: Decimal;
  projection: ReturnType<typeof projectTargetYear>;
  reading: ReturnType<typeof readingAgainstTarget> | null;
};

type DashboardTargetRow = Awaited<
  ReturnType<typeof readDashboardEvidence>
>["targets"][number];

export function EvidenceSummary({
  emissionsInWindow,
  totals,
  energy,
  target,
  targetView,
  uncalculatedRecords,
}: {
  emissionsInWindow: number;
  totals: ScopeTotals;
  energy: RecordedEnergy;
  target: DashboardTargetRow | null;
  targetView: TargetView | null;
  uncalculatedRecords: number;
}) {
  return (
    <section
      className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      aria-label="Current evidence summary"
    >
      <article className="border border-border p-6 md:p-7">
        <p className="font-mono text-[11px] leading-4 text-muted uppercase">
          Latest emissions
        </p>
        {emissionsInWindow === 0 ? (
          <EmptyCard
            text="No calculated emissions exist in this reporting window."
            href="/activity"
          />
        ) : (
          <>
            <p className="mt-5 font-serif text-[40px] leading-none tabular-nums md:text-[48px]">
              {tonnes(totals.total)}{" "}
              <span className="text-[18px]">tCO2e</span>
            </p>
            <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-5">
              <MiniFigure label="Scope 1" value={tonnes(totals.scope1)} />
              <MiniFigure label="Scope 2" value={tonnes(totals.scope2)} />
              <MiniFigure label="Scope 3" value={tonnes(totals.scope3)} />
            </dl>
            {/* Dual reporting — prompt 85. Shown only where a contractual
                rate is actually mapped, with the coverage it rests on, and
                never folded into the figure above it. */}
            {totals.scope2MarketBasedRecords > 0 ? (
              <p className="mt-5 border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
                Market-based: scope 2 {tonnes(totals.scope2MarketBased)}{" "}
                tCO2e, scopes 1-3 {tonnes(totals.totalMarketBased)} tCO2e,
                over {totals.scope2MarketBasedRecords.toLocaleString("en-GB")}{" "}
                of {totals.scope2Records.toLocaleString("en-GB")} scope 2
                records. The figures above are location-based.
              </p>
            ) : null}
            <p className="mt-5 font-mono text-[11px] leading-[18px] text-muted">
              Biogenic {tonnes(totals.biogenic)} tCO2e · outside scopes{" "}
              {tonnes(totals.outsideOfScopes)} tCO2e, reported separately.
            </p>
            <GapCaveat count={uncalculatedRecords} />
          </>
        )}
      </article>

      <article className="border border-border p-6 md:p-7">
        <p className="font-mono text-[11px] leading-4 text-muted uppercase">
          Recorded energy
        </p>
        {energy.currentReadings === 0 ? (
          <EmptyCard
            text="No eligible electricity or heat readings exist in this window."
            href="/activity"
          />
        ) : (
          <>
            <p className="mt-5 font-serif text-[40px] leading-none tabular-nums md:text-[48px]">
              {mwh(energy.currentMWh)}{" "}
              <span className="text-[18px]">MWh</span>
            </p>
            <p className="mt-5 font-mono text-[12px] leading-[18px]">
              {energy.change.ok
                ? `${compare(energy.change.percent, ZERO) > 0 ? "+" : ""}${toFixed(energy.change.percent, 1, "half-even")}% against the previous complete 12 months.`
                : energy.change.reason}
            </p>
            <p className="mt-3 font-serif text-[16px] leading-6 text-muted">
              Eligible committed electricity and heat readings only. This is
              not a whole-estate coverage claim.
            </p>
          </>
        )}
      </article>

      <article className="border border-border p-6 md:col-span-2 md:p-7 xl:col-span-1">
        <p className="font-mono text-[11px] leading-4 text-muted uppercase">
          Nearest active target
        </p>
        {!target || !targetView ? (
          <EmptyCard
            text="No active future target has been set."
            href="/targets"
          />
        ) : (
          <>
            <h2 className="mt-5 font-sans text-[24px] leading-7 font-bold">
              {target.name}
            </h2>
            <p className="mt-2 font-serif text-[16px] leading-6 text-muted">
              {TARGET_COVERAGE_LABELS[target.coverage]} ·{" "}
              {target.targetYear} · target {tonnes(targetView.figure, 3)}{" "}
              tCO2e
            </p>
            {targetView.projection.ok ? (
              <>
                <p className="mt-6 font-serif text-[32px] leading-none tabular-nums">
                  {tonnes(targetView.projection.projection.kgCo2e)} tCO2e
                </p>
                <p className="mt-2 font-mono text-[11px] leading-[18px] text-muted">
                  {targetView.projection.projection.basis === "trend"
                    ? "Linear run-rate"
                    : "Flat run-rate"}{" "}
                  projection · latest window ending{" "}
                  {targetView.projection.projection.windowEnd}
                </p>
                <TargetReading
                  reading={targetView.reading}
                  year={target.targetYear}
                />
              </>
            ) : (
              <p className="mt-6 font-serif text-[16px] leading-6 text-muted">
                {targetView.projection.reason}
              </p>
            )}
            <GapCaveat count={uncalculatedRecords} />
            <Link
              className="mt-6 inline-block font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              href="/targets"
            >
              Review target evidence
            </Link>
          </>
        )}
      </article>
    </section>
  );
}

function MiniFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] leading-4 text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-serif text-[18px] leading-6 tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function EmptyCard({
  text,
  href,
}: {
  text: string;
  href: "/activity" | "/targets";
}) {
  return (
    <div className="mt-5">
      <p className="font-serif text-[20px] leading-6 text-muted">{text}</p>
      <Link
        href={href}
        className="mt-6 inline-block font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Open the evidence workspace
      </Link>
    </div>
  );
}

function TargetReading({
  reading,
  year,
}: {
  reading: ReturnType<typeof readingAgainstTarget> | null;
  year: number;
}) {
  if (!reading) return null;
  if (!reading.ok)
    return (
      <p className="mt-4 font-serif text-[16px] leading-6 text-muted">
        {reading.reason}
      </p>
    );
  const direction = compare(reading.percent, ZERO);
  const magnitude = {
    units:
      reading.percent.units < 0n
        ? -reading.percent.units
        : reading.percent.units,
    scale: reading.percent.scale,
  };
  return (
    <p className="mt-4 font-sans text-[18px] leading-6 font-bold">
      {direction > 0
        ? `${toFixed(magnitude, 1, "half-even")}% off the ${year} goal.`
        : direction < 0
          ? `${toFixed(magnitude, 1, "half-even")}% ahead of the ${year} goal.`
          : `On the ${year} goal.`}
    </p>
  );
}
