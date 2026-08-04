import Image from "next/image";
import Link from "next/link";
import type { Article } from "../_content/articles";
import {
  ArrowUpRight,
  Button,
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
        <Image
          src={article.src}
          alt={article.alt ?? ""}
          width={768}
          height={768}
          sizes="(max-width: 1024px) 100vw, 612px"
          priority={priority}
          className="aspect-[612/356] w-full object-cover"
        />
      ) : (
        <Placeholder ratio="612 / 356" />
      )}
      <h3 className="mt-6 font-sans text-p1 font-bold group-hover:underline">
        {article.title}
      </h3>
      <Meta className="mt-2" items={[article.category, article.readTime]} />
      {article.description ? (
        <p className="mt-5 font-serif text-p2">{article.description}</p>
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
}: {
  role: string;
  type: string;
  location: string;
  body: string;
}) {
  return (
    <article className="max-w-[820px] rounded-card bg-white p-10 ring-1 ring-border sm:ring-0">
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-10">
        <div>
          <h3 className="font-sans text-p1 font-bold">{role}</h3>
          <Meta className="mt-2" items={[type, location]} />
          <p className="mt-5 max-w-[640px] font-serif text-p2">{body}</p>
        </div>
        {/* Desktop: pinned top-right. Mobile: falls to the bottom-left. */}
        <Button size="compact" className="mt-6 shrink-0 sm:mt-0">
          View role
        </Button>
      </div>
    </article>
  );
}
