import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  Wordmark                                                                    */
/* -------------------------------------------------------------------------- */

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-sans font-extrabold tracking-[-0.03em] leading-none ${className}`}
    >
      Aetherfield
    </span>
  );
}

/**
 * The company seal: three concentric ellipses of equal height, all tangent at
 * the same top and bottom vertices, labelled tech / earth / data, with the
 * wordmark set over two lines in the middle and an ® beneath it.
 *
 * One scaling SVG on a single measured viewBox, in the spirit of `JournalStamp`
 * on /journal: nothing inside it is sized per breakpoint, so the desktop and
 * tablet comps agree without a second set of numbers.
 *
 * **The mark is drawn symmetric and rotated +7°** — clockwise, right-hand side
 * low. Everything inside the `<g>` shares one axis (`x 141.5`) and one centre
 * (`141.5, 72`); the tilt is the single `rotate(7 141.5 72)` on the group, the
 * same discipline `AetherfieldSeal` on /about follows (that mark is a different
 * drawing at a different angle and stays local to that page).
 *
 * Fitted against `11-job-listing1/screen-sizes/Desktop.png`, where the mark's
 * bbox is `283×144+839+1399`; comps 12 and 13 measure identically, as does the
 * tablet artboard at `222×113` (= 0.7845×, which is why the tablet width is
 * authored as `222px`).
 *
 * The rotation is what the ink bbox and the tips demand: the outer ellipse's
 * extreme-x points sit 25.5px apart vertically (left `y 87.5`, right `y 113`)
 * inside a 283×143 ink box. Solving `hw = √(a²cos²θ + b²sin²θ)`,
 * `hh = √(a²sin²θ + b²cos²θ)` and the tip offset gives `θ ≈ 6.8°`; the type
 * landmarks give 7.1–7.25° (tech/data level, earth/® on one axis), so the mark
 * ships at **7°** with `a`/`b` solved exactly there: `ry 69.13`, `rx` 141.55 /
 * 97.11 / 59.60 from each ellipse's own extreme-x (x 29 / 72.5 / 109.5 local).
 *
 * **A mid-height chord is not `rx` once the ellipse is tilted**, which is how
 * the first cut of this mark came out upright: the chord at `y = cy` is centre-
 * symmetric for *any* rotation, so measuring it can never reveal the tilt. It
 * only pins `a` once θ is known — and it does check out here (predicted 138.5 /
 * 96.4 / 59.7 against the measured 137.5 / 96.5 / 59.5).
 *
 * Two "asymmetries" the first cut baked into the type are also just the
 * rotation, and are gone: `data` sitting 31px below `tech`, and the ® sitting
 * 7px left of the wordmark's axis. Un-rotated, all four land on one axis and
 * tech/data on one line.
 */
export function Seal({ className = "" }: { className?: string }) {
  const serif = { fontFamily: "var(--font-serif)" } as const;
  const sans = { fontFamily: "var(--font-sans)" } as const;

  return (
    <svg
      viewBox="0 0 283 144"
      fill="none"
      className={`text-accent ${className}`}
      role="img"
      aria-label="Aetherfield — tech, earth, data"
    >
      <g transform="rotate(7 141.5 72)">
        <g stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="141.5" cy="72" rx="141.55" ry="69.13" />
          <ellipse cx="141.5" cy="72" rx="97.11" ry="69.13" />
          <ellipse cx="141.5" cy="72" rx="59.6" ry="69.13" />
        </g>
        <g fill="currentColor">
          <text x="18.8" y="77.5" textAnchor="middle" fontSize="15" style={serif}>
            tech
          </text>
          <text x="141.5" y="21.7" textAnchor="middle" fontSize="15" style={serif}>
            earth
          </text>
          <text
            x="264.2"
            y="77.5"
            textAnchor="middle"
            fontSize="15"
            style={serif}
          >
            data
          </text>
          <text
            x="141.5"
            y="64.9"
            textAnchor="middle"
            fontSize="26"
            fontWeight="700"
            style={sans}
          >
            Aether
          </text>
          <text
            x="141.5"
            y="91.1"
            textAnchor="middle"
            fontSize="26"
            fontWeight="700"
            style={sans}
          >
            field
          </text>
        </g>
        {/* Drawn ®: a ring plus a serif R, so its size and baseline are fittable. */}
        <circle
          cx="141.5"
          cy="126.5"
          r="7.6"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x="141.5"
          y="131"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
          style={serif}
        >
          R
        </text>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                     */
/*  Square corners, black fill, mono label. The 4px bullet marks the single      */
/*  highest-intent action on a page.                                            */
/* -------------------------------------------------------------------------- */

type ButtonSize = "primary" | "secondary" | "compact";

const buttonSizing: Record<ButtonSize, string> = {
  primary: "h-[46px] pl-4 pr-5 gap-2.5",
  secondary: "h-[38px] px-3",
  compact: "h-[38px] px-3",
};

/* The look, shared by <button> and <a> so the two cannot drift. Everything
   that is not the element itself lives here. */
const BUTTON_BASE =
  "group inline-flex items-center justify-center bg-ink font-mono text-button font-medium text-white transition-[color,box-shadow] duration-150 hover:text-muted hover:shadow-[0_6px_18px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Bullet() {
  return (
    <span
      aria-hidden
      className="size-1 shrink-0 bg-white transition-colors duration-150 group-hover:bg-muted"
    />
  );
}

export function Button({
  size = "primary",
  bullet = size === "primary",
  className = "",
  children,
  ...props
}: {
  size?: ButtonSize;
  bullet?: boolean;
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${buttonSizing[size]} ${className}`}
      {...props}
    >
      {bullet ? <Bullet /> : null}
      {children}
    </button>
  );
}

/** The `Button` look on a link. For navigation, where a <button> nested in an
    <a> would be invalid; the classes come from the same constant, so the two
    cannot drift. `next/link` rather than a bare <a> so in-app destinations get
    client-side navigation; it renders an <a> and handles hash-only hrefs. */
export function ButtonLink({
  size = "primary",
  bullet = size === "primary",
  className = "",
  children,
  ...props
}: {
  size?: ButtonSize;
  bullet?: boolean;
} & ComponentProps<typeof Link>) {
  return (
    <Link
      className={`${BUTTON_BASE} ${buttonSizing[size]} ${className}`}
      {...props}
    >
      {bullet ? <Bullet /> : null}
      {children}
    </Link>
  );
}

/** Link-style action: sans 16/700 with a trailing arrow that slides on hover. */
export function LinkButton({
  className = "",
  children,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      className={`group inline-flex items-center font-sans text-nav font-bold text-ink ${className}`}
      {...props}
    >
      {children}
      <span
        aria-hidden
        className="ml-1.5 inline-block transition-transform duration-200 group-hover:translate-x-1.5"
      >
        →
      </span>
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/*  Metadata                                                                    */
/* -------------------------------------------------------------------------- */

/** Mono caption with the system's middot separator between items. */
export function Meta({
  items,
  className = "",
}: {
  items: string[];
  className?: string;
}) {
  return (
    <p className={`font-mono text-caption text-muted ${className}`}>
      {items.map((item, i) => (
        <span key={item}>
          {i > 0 ? <span className="mx-[7px]">·</span> : null}
          {item}
        </span>
      ))}
    </p>
  );
}

/** Label (serif, muted) over value (sans, ink). */
export function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-serif text-p2 text-muted">{label}</dt>
      <dd className="mt-[7px] font-sans text-p1 text-ink">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Image placeholder                                                           */
/* -------------------------------------------------------------------------- */

export function Placeholder({
  className = "",
  ratio = "16 / 9",
}: {
  className?: string;
  ratio?: string;
}) {
  return (
    <div
      aria-hidden
      style={{ aspectRatio: ratio }}
      className={`w-full bg-border ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons — 24px grid, 1px stroke, colour inherited                             */
/* -------------------------------------------------------------------------- */

export function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 16 16 8M9 8h7v7" />
    </svg>
  );
}

export function IconCircle({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-12 items-center justify-center rounded-full border border-ink text-ink">
      <span className="size-6">{children}</span>
    </span>
  );
}
