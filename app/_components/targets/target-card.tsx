import {
  type Decimal,
  ZERO,
  compare,
  parseDecimal,
  toFixed,
} from "../../../lib/domain/decimal";
import type { ScopeTotals } from "../../../lib/domain/emissions";
import {
  projectTargetYear,
  readingAgainstTarget,
  targetFigure,
  totalsForCoverage,
  trajectory,
} from "../../../lib/domain/targets";
import type { ListedTarget } from "../../../lib/db/target-queries";
import {
  TARGET_BASELINE_SOURCE_LABELS,
  TARGET_COVERAGE_LABELS,
  TARGET_STATUS_LABELS,
} from "../../../lib/validation/targets";
import { RetireTargetControl } from "./retire-target-control";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function tonnes(value: Decimal, places = 1) {
  return toFixed({ units: value.units, scale: value.scale + 3 }, places, "half-even");
}

function magnitude(value: Decimal): Decimal {
  return { units: value.units < 0n ? -value.units : value.units, scale: value.scale };
}

export function TargetCard({
  target,
  monthly,
  uncalculatedRecords,
  asOf,
}: {
  target: ListedTarget;
  monthly: { period: string; totals: ScopeTotals }[];
  uncalculatedRecords: number;
  asOf: string;
}) {
  const baseline = parseDecimal(target.baselineKgCo2e);
  const reduction = parseDecimal(target.reductionPercent);
  const computedBaseline = target.computedBaselineKgCo2e
    ? parseDecimal(target.computedBaselineKgCo2e)
    : null;
  if (!baseline.ok || !reduction.ok || (computedBaseline && !computedBaseline.ok)) {
    throw new Error("A stored target could not be read as a decimal.");
  }

  const targetKg = targetFigure(baseline.value, reduction.value);
  const path = trajectory({
    baseYear: target.baseYear,
    baselineKgCo2e: baseline.value,
    targetYear: target.targetYear,
    targetKgCo2e: targetKg,
    scale: 3,
    mode: "half-even",
  });
  const projection = projectTargetYear({
    monthly: monthly.map((period) => ({
      month: period.period,
      kgCo2e: totalsForCoverage(period.totals, target.coverage),
    })),
    asOf,
    targetYear: target.targetYear,
    scale: 3,
    mode: "half-even",
  });
  const reading = projection.ok
    ? readingAgainstTarget(
        projection.projection.kgCo2e,
        targetKg,
        1,
        "half-even",
      )
    : null;

  let readingText = "";
  if (reading?.ok) {
    const direction = compare(reading.percent, ZERO);
    const percent = toFixed(magnitude(reading.percent), 1, "half-even");
    readingText =
      direction > 0
        ? `${percent}% off the ${target.targetYear} goal at the current projection.`
        : direction < 0
          ? `${percent}% ahead of the ${target.targetYear} goal at the current projection.`
          : `On the ${target.targetYear} goal at the current projection.`;
  }

  const baselineDiffers =
    computedBaseline?.ok && compare(computedBaseline.value, baseline.value) !== 0;

  return (
    <li className="border-b border-border py-10 first:border-t">
      <article aria-labelledby={`target-${target.id}-heading`}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-mono text-[11px] leading-[16px] text-muted uppercase">
              {TARGET_STATUS_LABELS[target.status]} ·{" "}
              {TARGET_COVERAGE_LABELS[target.coverage]}
            </p>
            <h3
              id={`target-${target.id}-heading`}
              className="mt-2 font-sans text-[24px] leading-7 font-bold"
            >
              {target.name}
            </h3>
          </div>
          {target.status === "active" ? (
            <RetireTargetControl targetId={target.id} />
          ) : null}
        </div>

        <dl className="mt-7 grid gap-6 border-y border-border py-6 md:grid-cols-4">
          <Detail label="Filed baseline">
            {tonnes(baseline.value, 3)} tCO2e · {target.baseYear}
          </Detail>
          <Detail label="Reduction">{target.reductionPercent}%</Detail>
          <Detail label="Target figure">
            {tonnes(targetKg, 3)} tCO2e · {target.targetYear}
          </Detail>
          <Detail label="Set">
            {DATE_FORMAT.format(target.createdAt)} UTC
            <br />
            {TARGET_BASELINE_SOURCE_LABELS[target.baselineSource]}
          </Detail>
        </dl>

        {baselineDiffers && computedBaseline?.ok ? (
          <p className="mt-5 border-l-2 border-ink py-1 pl-4 font-mono text-[12px] leading-[18px]">
            The filed baseline is {tonnes(baseline.value, 3)} tCO2e. The
            calculated figure available when it was set was{" "}
            {tonnes(computedBaseline.value, 3)} tCO2e. The filed baseline has
            {" not been moved."}
          </p>
        ) : null}

        <section className="mt-8" aria-labelledby={`target-${target.id}-projection`}>
          <h4
            id={`target-${target.id}-projection`}
            className="font-mono text-[11px] leading-[16px] text-muted uppercase"
          >
            Projection
          </h4>
          {uncalculatedRecords > 0 ? (
            <p className="mt-4 border-l-2 border-ink py-1 pl-4 font-mono text-[12px] leading-[18px]">
              This reading is incomplete: {uncalculatedRecords.toLocaleString("en-GB")}{" "}
              committed {uncalculatedRecords === 1 ? "record has" : "records have"}{" "}
              no calculated emission and contribute nothing below.
            </p>
          ) : null}

          {projection.ok ? (
            <div className="mt-5">
              <p className="font-serif text-[36px] leading-[1.05] tabular-nums">
                {tonnes(projection.projection.kgCo2e, 1)} tCO2e
              </p>
              <p className="mt-2 max-w-[720px] font-serif text-[16px] leading-6 text-muted">
                {projection.projection.basis === "trend"
                  ? `Linear run-rate projection from two 12-month windows ending ${projection.projection.windowEnd}: W0 ${tonnes(projection.projection.previous12KgCo2e!, 1)} tCO2e, W1 ${tonnes(projection.projection.latest12KgCo2e, 1)} tCO2e.`
                  : `Flat run-rate projection from ${projection.projection.completeMonths} complete months, with the latest 12 ending ${projection.projection.windowEnd}. There is no earlier 12-month window behind a trend.`}
              </p>
              {reading?.ok ? (
                <p className="mt-4 font-sans text-[20px] leading-6 font-bold">
                  {readingText}
                </p>
              ) : reading ? (
                <p className="mt-4 max-w-[660px] font-serif text-[16px] leading-6 text-muted">
                  {reading.reason}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 max-w-[660px] font-serif text-[16px] leading-6 text-muted">
              {projection.reason}
            </p>
          )}
        </section>

        {path.ok ? (
          <section className="mt-8" aria-labelledby={`target-${target.id}-trajectory`}>
            <h4
              id={`target-${target.id}-trajectory`}
              className="font-mono text-[11px] leading-[16px] text-muted uppercase"
            >
              Linear trajectory · annual allowance
            </h4>
            <div className="mt-4 overflow-x-auto">
              <ol className="flex min-w-max border-y border-border">
                {path.points.map((point) => (
                  <li key={point.year} className="min-w-[136px] border-r border-border px-4 py-4 last:border-r-0">
                    <p className="font-mono text-[11px] leading-[16px] text-muted">
                      {point.year}
                    </p>
                    <p className="mt-1 font-serif text-[18px] leading-6 tabular-nums">
                      {tonnes(point.allowanceKgCo2e, 1)}
                    </p>
                    <p className="font-mono text-[10px] leading-4 text-muted">tCO2e</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : (
          <p className="mt-8 font-serif text-[16px] leading-6 text-muted">
            {path.reason}
          </p>
        )}

        {target.retiredAt ? (
          <p className="mt-6 font-mono text-[11px] leading-[18px] text-muted">
            Retired {DATE_FORMAT.format(target.retiredAt)} UTC. The commitment
            {" remains visible as part of the organisation's record."}
          </p>
        ) : null}
      </article>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 wrap-anywhere font-serif text-[16px] leading-6 text-ink">
        {children}
      </dd>
    </div>
  );
}
