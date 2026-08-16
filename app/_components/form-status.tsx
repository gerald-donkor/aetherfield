"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The announced, focus-managed result line every write-path leaf ends in —
 * AGENTS.md 8.2 rule 5, in one place instead of twenty-eight.
 *
 * > Success and failure are both accessible: the result is announced, focus is
 * > managed, and the state is legible without colour alone.
 *
 * **That contract was implemented by copy-paste at 28 sites across 24 files**,
 * so it was exactly as strong as the least careful copy — and the copies had
 * already diverged on `role`, which is why prompt 108 exists. The `useEffect`
 * that moves focus to the region when a message arrives is the part most easily
 * dropped in a copy and the part the rule most depends on, so it lives here now.
 *
 * ---
 *
 * **Why this is not in `app/_components/primitives.tsx`**, which §7.5 would
 * otherwise make the default home. That module has **no `"use client"` and every
 * primitive in it is stateless** — its own `FileField` docblock says so — and it
 * is imported by the marketing routes' server components. This component needs
 * `useRef` and `useEffect`, so hosting it there would put `"use client"` on the
 * whole module and hand `/`, `/about`, `/careers`, `/journal` and
 * `/design-system` client JavaScript they do not carry today. That is §8.1's
 * line, so it went in its own module instead — the fallback prompt 105 named,
 * taken deliberately rather than discovered in a bundle diff.
 *
 * ---
 *
 * **Every prop exists because a real site varies on it**, and nothing was
 * normalised: the rendered markup is byte-identical at all 28 adopted sites.
 * `role` in particular is passed through untouched — nine sites are `alert` and
 * nineteen are `status`, and reconciling them is prompt 108's decision to make
 * on its own rather than buried in a twenty-four-file mechanical diff.
 *
 * **Nothing here logs.** Several of these messages are formatted from user input
 * (AGENTS.md 8.3 rule 2).
 */
const FORM_STATUS_BASE =
  "border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none";

export type FormStatusProps = {
  /** The result text. Also the default focus trigger and the default body. */
  message?: ReactNode;
  /** Rendered instead of `message` when a site appends more than the sentence —
      `factor-picker` adds a field error under it. */
  children?: ReactNode;
  /** `p` at fourteen sites and `div` at fourteen; both are reproduced rather
      than unified, because unifying them would change rendered markup. */
  as?: "p" | "div";
  /** Passed through. See the note above on prompt 108. */
  role?: string;
  /** Defaults to `assertive` for `alert` and `polite` for `status`, which is
      what all 28 sites already did. No site needs to override it — `factor-picker`
      switches both on one condition and the derivation already gives it the same
      pair — but the prop stays for a site that one day does. */
  live?: "polite" | "assertive" | "off";
  /** The site's own leading utilities — spacing and width. */
  className?: string;
  /** Added when a message is present. `block` at most sites; a few carry their
      margin or width here instead of in `className`, and that distinction is
      preserved. */
  shown?: string;
  /** For the two regions that are conditionally *mounted* by their caller and so
      never need the `hidden` state. */
  pinned?: boolean;
  /** Overrides the focus trigger where a site watches more than the message —
      `message || complete`, `message || settled`, `message || done`. */
  focusOn?: unknown;
  id?: string;
};

export function FormStatus({
  message,
  children,
  as = "p",
  role = "status",
  live,
  className = "",
  shown = "block",
  pinned = false,
  focusOn,
  id,
}: FormStatusProps) {
  const ref = useRef<HTMLElement>(null);

  /* `focusOn === undefined` rather than `focusOn ?? message`, so a site can
     deliberately pass a falsy trigger and mean it. */
  const trigger = focusOn === undefined ? message : focusOn;

  useEffect(() => {
    if (trigger) ref.current?.focus();
  }, [trigger]);

  /* Composed by joining non-empty parts, which reproduces each site's original
     template literal exactly: leading utilities, then the base, then the
     visibility class. A site with no leading utilities produced
     `${BASE} ${shown}`, and that is what `filter(Boolean)` gives. */
  const classes = [
    className,
    FORM_STATUS_BASE,
    pinned ? "" : message ? shown : "hidden",
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    id,
    role,
    "aria-live": live ?? (role === "alert" ? "assertive" : "polite"),
    tabIndex: -1,
    className: classes,
  };
  const body = children ?? message;

  return as === "div" ? (
    <div {...shared} ref={ref as React.RefObject<HTMLDivElement>}>
      {body}
    </div>
  ) : (
    <p {...shared} ref={ref as React.RefObject<HTMLParagraphElement>}>
      {body}
    </p>
  );
}
