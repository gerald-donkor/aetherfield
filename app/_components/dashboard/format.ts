import { toFixed, type Decimal } from "../../../lib/domain/decimal";
import { toTonnes } from "../../../lib/domain/emissions";

/**
 * How `/dashboard` prints a figure. Moved out of `app/dashboard/page.tsx` by
 * prompt 120, so the three sections that were split out of that page print a
 * month and a tonnage the same way rather than each carrying a copy.
 *
 * **This is the only rounding on the path**, and it is `half-even` throughout:
 * the stored figure keeps every digit the arithmetic produced, and this is the
 * presentation step (`lib/domain/decimal.ts`). It is deliberately not shared with
 * `app/_components/activity/emissions-summary.tsx`, whose `tonnes` rounds under a
 * different mode — merging them would change a rendered figure.
 *
 * The month format is fixed to `en-GB` and UTC so a server-rendered label and a
 * hydrated one cannot disagree.
 */

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function monthName(month: string) {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

export function tonnes(value: Decimal, places = 1) {
  return toFixed(toTonnes(value), places, "half-even");
}

export function mwh(value: Decimal) {
  return toFixed(value, 1, "half-even");
}
