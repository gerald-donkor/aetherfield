import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArticleBodyLayout,
  ArticleMasthead,
  RecentArticles,
} from "../../_components/article/sections";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { Container } from "../../_components/home/sections";
import {
  ARTICLE_BODIES,
  FEATURED_ARTICLES,
  getArticle,
  WRITTEN_SLUGS,
} from "../../_content/articles";

type Params = Promise<{ slug: string }>;

/* Only the written articles are prerendered. The other five entries in
   ARTICLES are card copy with no prose behind them yet, so they 404. */
export function generateStaticParams() {
  return WRITTEN_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article || !ARTICLE_BODIES[slug]) return {};

  return {
    title: `${article.title} — Aetherfield`,
    description: article.description,
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const article = getArticle(slug);
  const body = article ? ARTICLE_BODIES[slug] : undefined;
  if (!article || !body) notFound();

  return (
    <>
      <Container>
        <SiteNav />
      </Container>

      {/* No CtaBand here — the comp runs the recent-articles band into the
          footer directly. */}
      <main>
        <ArticleMasthead article={article} body={body} />
        <ArticleBodyLayout body={body} />
        <RecentArticles articles={FEATURED_ARTICLES} />
      </main>

      <SiteFooter />
    </>
  );
}
