import Image from "next/image";
import Link from "next/link";
import type { Article, ArticleBody } from "../../_content/articles";
import { ArticleCardStacked } from "../cards";
import { Container } from "../home/sections";
import { MetaPair } from "../primitives";

/* The reading column runs on a 28px line pitch at every breakpoint, measured
   off the desktop and tablet comps. The design system's --text-p2 is a fixed
   20/24 and the settled pages depend on it, so the leading is set here on the
   prose instead of moving the token. */
const PROSE = "font-serif text-p2 leading-[28px]";

/* -------------------------------------------------------------------------- */
/*  Masthead + hero                                                             */
/* -------------------------------------------------------------------------- */

export function ArticleMasthead({
  article,
  body,
}: {
  article: Article;
  body: ArticleBody;
}) {
  return (
    <Container>
      <div className="pt-[60px] text-center md:pt-20">
        {/* Serif and muted here, unlike the mono Meta the cards use. */}
        <p className="font-serif text-p2 text-muted">
          {article.category}
          <span className="mx-[7px]">·</span>
          {article.readTime}
        </p>
        <h1 className="display-article-title mt-[15px] font-sans font-bold md:mt-[18px]">
          {article.title}
        </h1>
      </div>

      {/* 62:25 at every breakpoint — 1240×500 / 760×307 / 335×136 in the comps.
          The gap to the title is one value at all three: the title's own line
          box already scales with it. The LCP element, so it is never lazy. */}
      <Image
        src={body.hero.src}
        alt={body.hero.alt}
        width={1240}
        height={500}
        sizes="100vw"
        priority
        className="mt-[38px] aspect-[62/25] w-full object-cover"
      />
    </Container>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body — rail + reading column                                                */
/* -------------------------------------------------------------------------- */

export function ArticleBodyLayout({ body }: { body: ArticleBody }) {
  const meta = (
    <>
      <MetaPair label="Published" value={body.published} />
      <MetaPair label="Author" value={body.author} />
    </>
  );

  return (
    <Container>
      {/* The inner inset is the article's own, on top of the page gutter:
          60px from tablet, 80px on desktop, nothing on mobile. lg also carries
          4px more top padding than md, because Container's 24px desktop gutter
          makes the hero 3px shorter than the comp's — the rail and the lede
          still land on the comp's y. */}
      <div className="pt-[42px] pb-20 md:px-[60px] md:pt-20 lg:grid lg:grid-cols-[260px_740px] lg:gap-x-20 lg:px-20 lg:pt-[84px]">
        {/* Below lg this is not a rail — the two pairs share one row above the
            lede, as the tablet and mobile comps draw them. */}
        <dl className="grid grid-cols-2 gap-x-6 lg:block lg:space-y-8">
          {meta}
        </dl>

        <div className="mt-10 lg:mt-0">
          <p className={PROSE}>{body.lede}</p>

          {/* Spans the reading column only, not the rail. */}
          <hr className="mt-12 border-0 border-t border-rule" />

          {body.sections.map((section) => (
            <section key={section.heading} className="mt-12">
              <h2 className="font-sans text-p1 font-bold">{section.heading}</h2>
              <p className={`mt-6 ${PROSE}`}>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recent articles — full-bleed surface band                                   */
/* -------------------------------------------------------------------------- */

export function RecentArticles({ articles }: { articles: Article[] }) {
  return (
    <section className="bg-surface pt-[38px] pb-10 md:pt-[78px] md:pb-20 lg:pt-[118px] lg:pb-[120px]">
      <Container>
        {/* Mobile stacks and centres both; from md the link sits opposite the
            heading, its baseline on the heading's. */}
        <div className="flex flex-col items-center gap-3 text-center md:flex-row md:items-baseline md:justify-between md:gap-8 md:text-left">
          <h2 className="display-band-h2 font-sans font-bold">
            Recent articles
          </h2>
          <Link
            href="/journal"
            className="font-serif text-p2 underline underline-offset-[3px] hover:no-underline"
          >
            View all articles
          </Link>
        </div>

        {/* 3-up on desktop with the comp's 16px gutter; stacked below. The gap
            hangs off the link's line box on mobile and off the much larger
            heading's from md, so it is not one value. */}
        <div className="mt-[22px] grid gap-y-14 md:mt-[14px] lg:grid-cols-3 lg:gap-x-4">
          {articles.map((article) => (
            <ArticleCardStacked
              key={article.slug}
              article={article}
              href={`/article/${article.slug}`}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
