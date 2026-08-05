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
 * Fitted against `11-job-listing1/screen-sizes/Desktop.png`, where the mark's
 * bbox is `283×144+839+1399` (isolated with `-fx "(b-r)>0.15?1:0"`). In local
 * coordinates the three ellipses share `cx 141`, `cy 72` and `ry 71.25` — their
 * mid-height crossings sit at absolute x 842/883/920 and 1039/1076/1117, all
 * about the same centre 979.75 — giving `rx` 137 / 95.75 / 58.75. The ® centres
 * on x 134, under the wordmark rather than under the ellipses, and is drawn
 * rather than set as a glyph: Newsreader's ® is not fittable at this size.
 *
 * The /about founder's-story mark is the same seal drawn rotated -6.6°, fitted
 * against its own comp; that one stays local to that page.
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
      <g stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="141" cy="72" rx="137" ry="71.25" />
        <ellipse cx="141" cy="72" rx="95.75" ry="71.25" />
        <ellipse cx="141" cy="72" rx="58.75" ry="71.25" />
      </g>
      <g fill="currentColor">
        <text x="19.5" y="62" textAnchor="middle" fontSize="15" style={serif}>
          tech
        </text>
        <text x="147" y="22" textAnchor="middle" fontSize="15" style={serif}>
          earth
        </text>
        <text x="263" y="93" textAnchor="middle" fontSize="15" style={serif}>
          data
        </text>
        <text
          x="143"
          y="65"
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          style={sans}
        >
          Aether
        </text>
        <text
          x="143"
          y="91"
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
        cx="134"
        cy="126"
        r="7.6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <text
        x="134"
        y="130.5"
        textAnchor="middle"
        fontSize="11"
        fill="currentColor"
        style={serif}
      >
        R
      </text>
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
