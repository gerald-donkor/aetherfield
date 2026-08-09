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

/* -------------------------------------------------------------------------- */
/*  Fields                                                                      */
/* -------------------------------------------------------------------------- */

/* The control's shared classes, so `Field` and `TextareaField` cannot drift
   into a second field vocabulary. Sizing is deliberately *not* in here and is
   prefixed by each variant instead: it keeps `Field`'s emitted class string
   byte-identical to the one /sign-in and /sign-up already prerender. */
const CONTROL_BASE =
  "w-full border bg-white px-4 font-sans text-[16px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent focus:shadow-[0_0_0_1px_var(--color-accent)] disabled:cursor-not-allowed disabled:bg-surface";

/** Label, optional guidance and the explicit error state — the chrome both
    field variants wrap their control in. Not exported: it is an implementation
    detail of the two below, not a third thing to reach for. */
function FieldFrame({
  label,
  hint,
  error,
  className,
  id,
  hintId,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className: string;
  id: string;
  hintId?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block font-sans text-nav font-bold text-ink"
      >
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1.5 font-serif text-[16px] text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={errorId}
          className="mt-2 flex items-start gap-2 font-mono text-[12px] leading-[18px] text-ink"
        >
          <span aria-hidden className="mt-[7px] size-1 shrink-0 bg-ink" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The site's reusable text field: label, optional guidance, and an explicit
 * error state. Forms own validation and pass the settled state into it.
 */
export function Field({
  label,
  hint,
  error,
  className = "",
  id,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
} & Omit<ComponentProps<"input">, "id">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      className={className}
      id={id}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...props}
        id={id}
        className={`mt-2 h-[52px] ${CONTROL_BASE} ${
          error ? "border-ink" : "border-border"
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
    </FieldFrame>
  );
}

/**
 * `Field` for prose. Same label / hint / error chrome and the same control
 * classes — the element is the only difference, which is why it shares
 * `FieldFrame` and `CONTROL_BASE` rather than restating either. Added by build
 * step 2 for the demo-request dialog's optional message.
 */
export function TextareaField({
  label,
  hint,
  error,
  className = "",
  id,
  rows = 4,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
} & Omit<ComponentProps<"textarea">, "id">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      className={className}
      id={id}
      hintId={hintId}
      errorId={errorId}
    >
      <textarea
        {...props}
        id={id}
        rows={rows}
        className={`mt-2 resize-y py-3 ${CONTROL_BASE} ${
          error ? "border-ink" : "border-border"
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
    </FieldFrame>
  );
}

/**
 * `Field` for a file, added by build step 5 for the apply dialog's CV. Same
 * label / hint / error chrome and the same `CONTROL_BASE`, for the reason
 * `TextareaField` shares them: the alternative is a second field vocabulary.
 *
 * **The native `<input type="file">` is kept and styled, not replaced.** The
 * usual pattern — hide the input, put the look on a `<label>` — moves focus onto
 * an element the eye cannot find and rebuilds the picker's keyboard behaviour by
 * hand. Tailwind v4's `file:` variant reaches `::file-selector-button` directly,
 * so the real control keeps every platform behaviour and still wears the site's
 * compact-button look: ink fill, white mono label, square corners, and the same
 * `hover:text-muted` `BUTTON_BASE` uses. No `Bullet` — the 4px mark belongs to
 * the page's highest-intent action, and a pseudo-element cannot hold a child
 * anyway.
 *
 * **The 52px box is derived, not eyeballed:** 6px of padding, the 38px `compact`
 * button, 6px, plus the 1px borders — exactly `Field`'s `h-[52px]`, so a form
 * that mixes the two keeps one rhythm. `flex items-center` centres the button
 * and the filename inside that box; where a browser declines to lay out the
 * file input's shadow children as flex items, the same padding still produces
 * the same height on a normal line box, so the fallback is the same geometry
 * rather than a broken one.
 *
 * **The chosen file is announced through a `role="status"` line, and the browser
 * shows the name itself.** A bare file input gives no reliable change
 * announcement, and a *visible* second copy of the name would print it twice
 * within 20px on a page whose whole register is restraint. So the visible
 * confirmation is the input's own filename text — which inherits
 * `CONTROL_BASE`'s `font-sans text-[16px] text-ink` and is therefore already set
 * in the site's type — and the announcement is a screen-reader-only live region
 * that adds the size the native text omits.
 *
 * Stateless, like every other primitive here: `primitives.tsx` has no
 * `"use client"` and is imported by server components, so the form owns the
 * selected file and passes the settled state in.
 */
export function FileField({
  label,
  hint,
  error,
  className = "",
  id,
  fileName,
  fileSize,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  /** The chosen file's name, or nothing chosen. Announced, not re-rendered. */
  fileName?: string;
  /** Already formatted for reading — "412 KB". The primitive does no unit
      arithmetic; the form that holds the `File` does. */
  fileSize?: string;
} & Omit<ComponentProps<"input">, "id" | "type">) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const statusId = `${id}-status`;
  const describedBy = [props["aria-describedby"], hintId, statusId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      className={className}
      id={id}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        {...props}
        type="file"
        id={id}
        className={`mt-2 flex items-center overflow-hidden py-1.5 ${CONTROL_BASE} ${
          error ? "border-ink" : "border-border"
        } file:mr-4 file:h-[38px] file:cursor-pointer file:border-0 file:bg-ink file:px-3 file:font-mono file:text-button file:font-medium file:text-white file:transition-colors hover:file:text-muted disabled:file:cursor-not-allowed`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      <div id={statusId} role="status" aria-live="polite" className="sr-only">
        {fileName
          ? `Selected: ${fileName}${fileSize ? `, ${fileSize}` : ""}`
          : "No file selected."}
      </div>
    </FieldFrame>
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
      {/* Drawn, not the Unicode glyph: Archivo has no "→", so a text arrow is
          served by whatever fallback the browser picks and its shape differs
          machine to machine (the reference screenshot's 12x9 chevron renders as
          a 15x6 flat dart in headless Chromium). Same rule as the Seal's ® and
          the job-listing bullets.

          The viewBox is the ink box, so the *stroke's* outer edges — not the
          paths — fill 0..12 x 0..9. Shaft centre y 5, not 4.5: the stroke then
          spans 4..6 and lands on two whole device pixels, where 4.5 spreads it
          over three at 50 % and the shaft renders 3px thick. The chevron is
          symmetric about 4.5 with its vertex at x 10.6, whose 45deg miter tip
          reaches x 12.01 — that, not the shaft, is what makes the ink 12 wide.
          The arms overrun the top and bottom edges and are clipped by the
          viewport, which squares off their butt caps the way the reference
          draws them. Measured off the screenshot's ink map. */}
      <svg
        aria-hidden
        viewBox="0 0 12 9"
        width="12"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="ml-1.5 inline-block transition-transform duration-200 group-hover:translate-x-1.5"
      >
        <path d="M0 5h10.6" />
        <path d="M6.3 0.2 10.6 4.5 6.3 8.8" />
      </svg>
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
