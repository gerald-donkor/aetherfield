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
 * **Every prop exists because a real site varies on it.** Nothing was normalised
 * when this component was extracted at prompt 105; the rendered markup was
 * byte-identical at all 28 adopted sites, `role` included.
 *
 * ---
 *
 * ## The `role` rule — settled at prompt 108
 *
 * **A result region that takes focus is `status`. `alert` is for a message that
 * appears without focus moving to it.** That is the rule; this is where it is
 * written, so the next component inherits it instead of guessing.
 *
 * Before prompt 108 there was no rule: nine regions were `alert` and thirty were
 * `status` for the same success-or-error result, **and not one of the nine
 * carried a comment or docblock giving a reason.**
 *
 * The reason for the rule is that `alert` and this component's focus effect
 * work against each other. Read from the sources, not recalled (§12 rule 2), on
 * 16 Aug 2026:
 *
 * - W3C ARIA Authoring Practices, *Alert Pattern* — "Because alerts are intended
 *   to provide important and potentially time-sensitive information without
 *   interfering with the user's ability to continue working, **it is crucial
 *   they do not affect keyboard focus.**"
 * - MDN, *alert role* — `role="alert"` is `aria-live="assertive"` plus
 *   `aria-atomic="true"`; "As they don't receive focus, focus does not need to
 *   be managed and no user interaction should be required."
 *
 * Every region here **does** move focus, deliberately, because that is what
 * AGENTS.md §8.2 rule 5 asks for. So the assertive interruption buys nothing —
 * focus is what guarantees the user reaches the message — while the element is
 * announced on insertion *and* again when focus lands on it.
 *
 * `sign-out-button.tsx` keeps `role="alert"` and is right to: it is conditionally
 * mounted and moves no focus, which is exactly the case the rule reserves
 * `alert` for. The deliverable was a stated rule, not uniformity.
 *
 * **One implication, stated because it is a real change and not an addition.**
 * `role="alert"` implies `aria-atomic="true"`; `status` does not. Dropping to
 * `status` therefore drops that implicit atomicity, so a partial update to the
 * region announces only the changed part. These regions replace their whole text
 * at once, so there is no partial update to mis-announce. No `aria-atomic` was
 * added — that would be its own judgement.
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
    "aria-live": (role === "alert" ? "assertive" : "polite") as
      | "assertive"
      | "polite",
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
