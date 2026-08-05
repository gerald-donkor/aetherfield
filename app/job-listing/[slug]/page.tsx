import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { Container } from "../../_components/home/container";
import { BackToCareers, JobListing } from "../../_components/job/sections";
import { getJob, JOB_BODIES, WRITTEN_JOB_SLUGS } from "../../_content/jobs";

type Params = Promise<{ slug: string }>;

/* Only roles with prose behind them are prerendered. The UX Designer and
   Product Manager entries are card copy on /careers and 404 here by design,
   exactly as the unwritten article slugs do. */
export function generateStaticParams() {
  return WRITTEN_JOB_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = getJob(slug);
  if (!job || !JOB_BODIES[slug]) return {};

  return {
    title: `${job.role} — Careers at Aetherfield`,
    description: job.body,
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const job = getJob(slug);
  const body = job ? JOB_BODIES[slug] : undefined;
  if (!job || !body) notFound();

  return (
    <>
      {/* SiteNav carries its own gutters and is sticky: it must not sit inside
          a one-child wrapper, or it unpins as soon as that wrapper scrolls off. */}
      <SiteNav />

      {/* The same shell /careers uses, for the same reasons recorded there: the
          sky cannot wrap SiteNav, so `main` is a sibling pulled up under the
          60px bar and padded back down. The 120px foot is measured — the card
          to footer gap is 121px at 375, 800 and 1280. */}
      <main className="hero-sky -mt-[60px] pt-[60px] pb-[120px]">
        <Container>
          <BackToCareers />
          <JobListing job={job} body={body} />
        </Container>
      </main>

      <SiteFooter />
    </>
  );
}
