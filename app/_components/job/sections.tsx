import Link from "next/link";
import { Button, ButtonLink, Seal } from "../primitives";
import type { Job, JobBody } from "../../_content/jobs";

/* -------------------------------------------------------------------------- */
/*  Back to Careers — centred, above the card                                   */
/* -------------------------------------------------------------------------- */

/**
 * Serif, ink, with a leading arrow. Centred on the page rather than on the
 * card, which is the same thing here since the card is centred too.
 *
 * The top padding is fitted per breakpoint, not scaled from one number: the
 * cap-top inset from the content box differs by step, exactly as the careers
 * masthead records.
 */
export function BackToCareers() {
  return (
    <p className="pt-[58px] text-center sm:pt-[78px]">
      <Link
        href="/careers"
        className="font-serif text-p2 text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span aria-hidden className="mr-2">
          &larr;
        </span>
        Back to Careers
      </Link>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  The card                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One white card holds the whole listing — masthead, prose and the closing call
 * to action. It must **not** be `overflow-hidden`: the seal deliberately spills
 * past its right edge onto the sky.
 *
 * Width is 335 / 720 / 820 across the three comps. Tablet gutters are 40 rather
 * than the container's usual 20, so the cap is authored at `md` as well as `lg`
 * instead of letting the container decide.
 */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <article className="relative mx-auto mt-6 w-full rounded-card bg-white p-6 sm:mt-[42px] sm:p-10 md:max-w-[720px] lg:max-w-[820px]">
      {children}
    </article>
  );
}

/** Full-width hairline at `--color-border`, with the comps' 48px of air on
    both sides. */
function Rule() {
  return <hr className="mt-12 border-0 border-t border-border" />;
}

/**
 * The 4×4 bullet is drawn rather than left to `list-disc`: the comp puts the
 * marker 13px in from the content edge with the text at 31px, 12px below the
 * line box top, and `list-style` cannot be pinned to those numbers. The list
 * stays a real `ul`/`li`.
 */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-7 space-y-2">
      {items.map((item) => (
        <li
          key={item}
          className="relative ps-[31px] font-serif text-p2 leading-[28px]"
        >
          <span
            aria-hidden
            className="absolute top-3 left-[13px] size-1 rounded-full bg-ink"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function JobListing({ job, body }: { job: Job; body: JobBody }) {
  return (
    <Card>
      <div>
        <h1 className="display-job-h2 font-sans font-bold">{job.role}</h1>
        {/* Serif and muted, not the mono `Meta` the /careers cards use —
            verified on a 300 % crop of `Desktop.png -crop 400x80+265+240`. */}
        <p className="mt-2 font-serif text-p2 text-muted">
          {job.type}
          <span className="mx-[7px]">·</span>
          {job.location}
        </p>
        <p className="mt-6 font-serif text-p2">{body.lede ?? job.body}</p>
        {/* Pinned to the card's top-right corner at 800 and 1280, in flow below
            the lede at 375. Absolute rather than a flex row beside the title:
            the comp runs the lede the full content width *underneath* the
            button, and a row shortens the measure enough to cost a line. */}
        <ButtonLink
          href="#apply"
          size="compact"
          className="mt-6 sm:absolute sm:top-10 sm:right-10 sm:mt-0"
        >
          Apply now
        </ButtonLink>
      </div>

      <Rule />

      {/* The seal hangs off the end of the prose, overflowing the card's right
          edge onto the sky — 1121 against a card right of 1050 at 1280. That is
          the design, so nothing above this may be clipped. */}
      <div className="relative">
        {body.sections.map((section, i) => (
          <section
            key={section.heading}
            className={i > 0 ? "mt-[52px]" : "mt-12"}
          >
            <h2 className="font-sans text-p1 font-bold">{section.heading}</h2>
            {section.body ? (
              <p className="mt-7 font-serif text-p2 leading-[28px]">
                {section.body}
              </p>
            ) : null}
            {section.items ? <Bullets items={section.items} /> : null}
          </section>
        ))}
        {/* Bottom-anchored, and measured: the seal follows the end of the prose,
            not any one section's shape. Comp 11's last section is a list and
            comp 12's is a paragraph, yet both put the seal's bottom 74
            (desktop) / 107 (tablet) above the closing rule — i.e. ~24 / ~55
            above the prose block's bottom edge once the Rule's own mt-12 is
            taken off. Top-anchoring cannot fit both: held against comp 12's
            last list it lands 180px high. */}
        <Seal className="pointer-events-none absolute bottom-[55px] left-[76.8%] hidden w-[222px] sm:block lg:bottom-[24px] lg:w-[283px]" />
      </div>

      <Rule />

      {/* No CtaBand: the comp keeps the closing call to action inside the card,
          and the card runs into the footer exactly as /careers does. */}
      <div id="apply" className="mt-12 text-center">
        <h2 className="display-job-h2 mx-auto max-w-[560px] font-sans font-bold text-balance">
          {body.cta}
        </h2>
        {/* Inert, like the /careers open-application card's Apply now: no comp
            gives a destination. Wire both to a real URL or mailto when one
            exists. */}
        <Button className="mt-7">Apply now</Button>
      </div>
    </Card>
  );
}
