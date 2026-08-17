import type { PRINCIPLES } from "./principles-data";

/* One principle card, rendered on `/` ("Built for clarity") and on /about
   ("Our values") over the same `PRINCIPLES` array.

   **This is a variant, not a copy.** The two call sites differ in five measured
   ways, and four of them are comp-fitted numbers the front matter forbids
   chasing:

   |                  | `/`                                  | `/about`                    |
   | ---------------- | ------------------------------------ | --------------------------- |
   | list wrapper     | `<ul>` inside `<Reveal as="section">` | `<Reveal as="ul">`         |
   | grid             | `mt-10 grid gap-6 md:mt-12 lg:grid-cols-3` | `mt-8 grid gap-4 md:mt-10 lg:grid-cols-3` |
   | card             | `bg-white p-8 md:p-10`               | `bg-surface p-10`           |
   | heading spacing  | `mt-8`                               | `mt-5`                      |
   | stagger hook     | `data-reveal-item`                   | absent                      |

   So only the invariant part lives here: the card's own box model, the SVG
   attribute block, and the heading/body pair. The grid and the `Reveal` wrapper
   stay at each call site, because they differ structurally rather than by a
   class — see `docs/motion-site.md` for why /about's list-level reveal is not
   the homepage's section-level stagger.

   `revealItem` is a GSAP hook, not styling: the homepage's `Reveal` selects
   `[data-reveal-item]` within its own scope, and /about's cards deliberately
   carry none. */

type Principle = (typeof PRINCIPLES)[number];

export function PrincipleCard({
  principle,
  className,
  headingClassName,
  revealItem = false,
}: {
  principle: Principle;
  /** Background and padding — the two the comps set per page. */
  className: string;
  /** The heading's top margin, likewise measured per page. */
  headingClassName: string;
  /** Emit the homepage stagger hook. Off on /about, which reveals its list. */
  revealItem?: boolean;
}) {
  return (
    <li
      className={`flex flex-col rounded-card ${className}`}
      data-reveal-item={revealItem || undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-12"
        aria-hidden
      >
        {principle.icon}
      </svg>
      <h3 className={`${headingClassName} font-sans text-p1 font-bold`}>
        {principle.title}
      </h3>
      <p className="mt-2 font-serif text-p2">{principle.body}</p>
    </li>
  );
}
