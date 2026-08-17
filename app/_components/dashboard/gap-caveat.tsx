/**
 * "This figure is incomplete", beside every figure it applies to.
 *
 * Moved out of `app/dashboard/page.tsx` by prompt 120, unchanged. It is its own
 * file because it is the one piece three of that page's sections share: the
 * emissions card, the target card and the trend section each render it, and no
 * total on `/dashboard` may read as complete while a committed record has no
 * calculated emission.
 *
 * **A Server Component**, and it renders nothing when the count is zero.
 */

export function GapCaveat({ count }: { count: number }) {
  return count > 0 ? (
    <p className="mt-5 border-l-2 border-ink py-1 pl-4 font-mono text-[11px] leading-[18px]">
      Incomplete: {count.toLocaleString("en-GB")} committed{" "}
      {count === 1 ? "record has" : "records have"} no calculated emission and
      contribute nothing to this figure.
    </p>
  ) : null;
}
