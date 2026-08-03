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
      className={`group inline-flex items-center justify-center bg-ink font-mono text-button font-medium text-white transition-[color,box-shadow] duration-150 hover:text-muted hover:shadow-[0_6px_18px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${buttonSizing[size]} ${className}`}
      {...props}
    >
      {bullet ? (
        <span
          aria-hidden
          className="size-1 shrink-0 bg-white transition-colors duration-150 group-hover:bg-muted"
        />
      ) : null}
      {children}
    </button>
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
