import { trendTotal, type TrendMonth } from "../../../lib/domain/dashboard";
import {
  ZERO,
  compare,
  divide,
  toFixed,
  type Decimal,
} from "../../../lib/domain/decimal";
import { monthName, tonnes } from "./format";

/**
 * `/dashboard`'s twelve-month emissions trend. Moved out of
 * `app/dashboard/page.tsx` by prompt 120.
 *
 * **The bars are decoration and the table is the chart.** The bar row is
 * `aria-hidden`, and the same twelve values are rendered as a captioned table
 * beneath it — so the trend is legible without colour, without height, and to a
 * screen reader. Nothing here is animated and no GSAP reaches the backend UI
 * (AGENTS.md 7.5).
 *
 * **A month with no calculated record stays a gap.** It renders as a dashed rule
 * and the words "No calculated record", never as a zero — a stored zero is data
 * and a missing month is not, and drawing them alike would put a figure in a
 * trend that no record supports.
 *
 * **A Server Component**, and the bar heights are computed with the exact
 * decimal engine rather than `Number` arithmetic.
 */

export function TrendChart({ months }: { months: TrendMonth[] }) {
  const values = months.map(trendTotal);
  let max = ZERO;
  for (const value of values) if (value && compare(value, max) > 0) max = value;
  const height = (value: Decimal | null) => {
    if (!value || compare(max, ZERO) === 0) return value ? 4 : 0;
    const ratio = divide(
      { units: value.units * 100n, scale: value.scale },
      max,
      1,
      "half-even",
    );
    return ratio.ok
      ? Math.max(4, Number(toFixed(ratio.value, 1, "half-even")))
      : 0;
  };
  return (
    <div className="mt-8 border-y border-border py-6 md:py-8">
      <div
        className="grid h-[220px] grid-cols-12 items-end gap-1 md:h-[280px] md:gap-2"
        aria-hidden="true"
      >
        {months.map((month, index) => {
          const value = values[index];
          return (
            <div
              key={month.month}
              className="flex h-full items-end border-b border-border"
            >
              <span
                className={`w-full ${value ? "bg-accent" : "border-t border-dashed border-muted"}`}
                style={{ height: `${height(value)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left">
          <caption className="sr-only">
            Monthly emissions values and missing-data gaps for the latest 12
            complete months.
          </caption>
          <thead>
            <tr>
              {months.map((month) => (
                <th
                  key={month.month}
                  scope="col"
                  className="border-r border-border px-2 pb-2 font-mono text-[10px] leading-4 text-muted last:border-r-0"
                >
                  {monthName(month.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {months.map((month, index) => (
                <td
                  key={month.month}
                  className="border-r border-border px-2 pt-2 font-mono text-[11px] leading-4 tabular-nums last:border-r-0"
                >
                  {values[index]
                    ? `${tonnes(values[index]!, 1)} tCO2e`
                    : "No calculated record"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
