import Image from "next/image";
import Link from "next/link";
import type { Article } from "../_content/articles";
import {
  ArrowUpRight,
  Button,
  ButtonLink,
  IconCircle,
  Meta,
  Placeholder,
} from "./primitives";

/* -------------------------------------------------------------------------- */
/*  Article card — 3 layouts off one content model                              */
/* -------------------------------------------------------------------------- */

/* The content model lives with the content. Re-exported here so the card and
   its type still arrive together for consumers. */
export type { Article };

/**
 * Stacked / feature. Image 612×356, then title → meta → description.
 * `href` makes the whole card one link; without it the card is inert, which is
 * how the styleguide renders it.
 */
export function ArticleCardStacked({
  article,
  href,
  priority = false,
  className = "",
}: {
  article: Article;
  href?: string;
  priority?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {article.src ? (
        // The span is the clip box — the same device the homepage journal
        // thumbnails use. `transition-[scale]`, never `transition-[transform]`:
        // Tailwind v4 emits `scale-105` as the independent `scale` property, so
        // a transform-only transition would silently not animate it. v4 already
        // wraps `group-hover:` in `@media (hover:hover)`, so nothing sticks on
        // touch and no guard is authored. 500ms and 5% are judgements, not
        // measurements — see AGENTS.md.
        <span className="block overflow-hidden">
          <Image
            src={article.src}
            alt={article.alt ?? ""}
            width={768}
            height={768}
            sizes="(max-width: 1024px) 100vw, 612px"
            priority={priority}
            className="aspect-[612/356] w-full object-cover transition-[scale] duration-500 ease-in-out group-hover:scale-105 motion-reduce:transition-none"
          />
        </span>
      ) : (
        <Placeholder ratio="612 / 356" />
      )}
      {/* The reference draws no underline — the title and the description just
          fade. Measured 0.665 ± 0.005 against a white field; 0.7 is the value
          the homepage journal rows already ship, so the site keeps one fade.
          `duration-300 ease-in-out` is that same fitted curve. Meta and image
          measure unchanged in the reference and are left alone. */}
      <h3 className="mt-6 font-sans text-p1 font-bold transition-opacity duration-300 ease-in-out group-hover:opacity-70 motion-reduce:transition-none">
        {article.title}
      </h3>
      <Meta className="mt-2" items={[article.category, article.readTime]} />
      {article.description ? (
        <p className="mt-5 font-serif text-p2 transition-opacity duration-300 ease-in-out group-hover:opacity-70 motion-reduce:transition-none">
          {article.description}
        </p>
      ) : null}
    </>
  );

  return (
    <article className={className}>
      {href ? (
        <Link
          href={href}
          className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </article>
  );
}

/** Horizontal. 620×150 on --color-border, image 165×100 left. */
export function ArticleCardHorizontal({ article }: { article: Article }) {
  return (
    <article className="flex max-w-[620px] items-center gap-6 bg-border p-[25px]">
      <div className="hidden h-[100px] w-[165px] shrink-0 bg-white/60 sm:block" />
      <div>
        <h3 className="font-sans text-[18px] leading-tight font-bold">
          {article.title}
        </h3>
        <Meta className="mt-2" items={[article.category, article.readTime]} />
      </div>
    </article>
  );
}

/** Mobile stacked. Card 375×335 on --color-border, image 375×227. */
export function ArticleCardCompact({ article }: { article: Article }) {
  return (
    <article className="max-w-[375px] bg-border pb-6">
      <Placeholder ratio="375 / 227" className="bg-white/60" />
      <div className="px-6 pt-6">
        <h3 className="font-sans text-p1 font-bold">{article.title}</h3>
        <Meta className="mt-2" items={[article.category, article.readTime]} />
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Value card — 400×246, radius 16                                             */
/* -------------------------------------------------------------------------- */

export function ValueCard({
  title,
  body,
  tinted = false,
}: {
  title: string;
  body: string;
  tinted?: boolean;
}) {
  return (
    <article
      className={`flex max-w-[400px] flex-col rounded-card p-10 ${
        tinted ? "bg-surface" : "bg-white"
      }`}
    >
      <IconCircle>
        <ArrowUpRight className="size-6" />
      </IconCircle>
      <h3 className="mt-8 font-sans text-p1 font-bold">{title}</h3>
      <p className="mt-[9px] font-serif text-p2">{body}</p>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Job card — 820×194, radius 16                                               */
/* -------------------------------------------------------------------------- */

export function JobCard({
  role,
  type,
  location,
  body,
  action = "View role",
  href,
  open = false,
}: {
  role: string;
  type: string;
  location: string;
  body: string;
  action?: string;
  /** Destination for the action. Without one it stays the inert button the
      styleguide and the open-application card render. */
  href?: string;
  /** Dashed outline over the page instead of a white fill — the open
      application card at the foot of `/careers`. */
  open?: boolean;
}) {
  return (
    <article
      className={`relative max-w-[820px] rounded-card p-6 sm:p-10 ${
        open ? "" : "bg-white"
      }`}
    >
      {/* CSS `border-dashed` draws Chrome's own ~2/2 pattern at 1px and cannot
          be tuned; the comp measures 7 on / 9 off. So the frame is drawn.
          strokeWidth 2 on the viewport boundary is deliberate: the SVG clips
          the outer half, leaving exactly the 1px the comp draws, with no
          fractional x="0.5" geometry that browsers disagree on. */}
      {open ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full text-ink"
        >
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="7 9"
          />
        </svg>
      ) : null}
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-10">
        <div>
          <h3 className="font-sans text-p1 font-bold">{role}</h3>
          <Meta className="mt-2" items={[type, location]} />
          <p className="mt-5 max-w-[640px] font-serif text-p2">{body}</p>
        </div>
        {/* Desktop: pinned top-right. Mobile: falls to the bottom-left. */}
        {href ? (
          <ButtonLink size="compact" href={href} className="mt-6 shrink-0 sm:mt-0">
            {action}
          </ButtonLink>
        ) : (
          <Button size="compact" className="mt-6 shrink-0 sm:mt-0">
            {action}
          </Button>
        )}
      </div>
    </article>
  );
}
