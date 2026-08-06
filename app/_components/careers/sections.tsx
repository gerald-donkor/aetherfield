import { JobCard } from "../cards";
import { CareersMastheadText } from "../motion/careers-masthead-text";
import { Reveal } from "../motion/reveal";
import { JOBS, WRITTEN_JOB_SLUGS } from "../../_content/jobs";

/* -------------------------------------------------------------------------- */
/*  Masthead — two centred lines, serif over sans                               */
/* -------------------------------------------------------------------------- */

/**
 * The mixed setting is the page's one signature move and it is what the comp
 * draws: line 1 is Newsreader, line 2 is Archivo — verified on a 3× crop of
 * `Desktop.png -crop 400x150+450+140`, where line 2 has Archivo's
 * flat-terminal `a` and the wordmark's `fi` shape, at a much lighter weight
 * than the extrabold footer wordmark.
 */
export function CareersMasthead() {
  return (
    /* CareersMastheadText renders the `<h1>` itself and takes this class string
       over verbatim, so no box is added and nothing moves. It splits the two
       lines to characters and blurs them in — the user's explicit addition; the
       recording shows a plain fade and rise with crisp glyph edges at every
       stage. It plays on load rather than on a ScrollTrigger, the call the hero
       and the journal stamp both make for an above-the-fold block. */
    <CareersMastheadText className="display-careers-title pt-[66px] text-center font-serif sm:pt-[89px] lg:pt-[88px]">
      {/* Two block lines rather than one `<br>`: with both fonts on a single
          line box, Chrome unions the Newsreader strut with the taller Archivo
          inline box and the pair runs 8px past the authored leading. One block
          per line keeps each line box at exactly the leading. */}
      <span className="block">Careers at</span>
      <span className="block font-sans font-medium">Aetherfield</span>
    </CareersMastheadText>
  );
}

/* -------------------------------------------------------------------------- */
/*  Job list — 820 desktop cap, 16px gaps                                       */
/* -------------------------------------------------------------------------- */

/** 820 is the desktop cap; at 800 and 375 the container gutters take over
    (760 and 335), which is exactly what the comps measure. */
export function JobList() {
  return (
    /* One staggered trigger over the whole list, not one Reveal per card.
       /journal uses per-card triggers because its grid is ~3000px tall and a
       single trigger would run four cards far below the fold; this list is
       ~900px at 1280 and the recording reveals all four together at load, so
       one trigger at Reveal's default `top 88%` — which fires at load at every
       breakpoint, the list top being y ≈ 216–332 — is both simpler and closer
       to the source.

       `delay` is the masthead → list gap: 0.139s fitted off `career.webm` and
       0.167s measured independently off `career-joblisting.webm`, against a
       site stagger of 0.08. Two steps. `y` is a judgement anchored on the
       cards' *observed* 56.6px of travel, which puts Reveal's default 36 well
       short. See AGENTS.md. */
    <Reveal
      as="ul"
      stagger
      delay={0.16}
      y={72}
      className="mx-auto mt-8 max-w-[820px] space-y-4"
    >
      {JOBS.map((job) => (
        <li key={job.role} data-reveal-item>
          <JobCard
            role={job.role}
            type={job.type}
            location={job.location}
            body={job.body}
            action={job.action}
            /* Only roles whose listing is written get a link — the other two
               comps are not built yet, and a link to a notFound() is worse than
               an inert button. The same rule /journal uses for its cards. */
            href={
              WRITTEN_JOB_SLUGS.includes(job.slug)
                ? `/job-listing/${job.slug}`
                : undefined
            }
            open={job.open}
          />
        </li>
      ))}
    </Reveal>
  );
}
