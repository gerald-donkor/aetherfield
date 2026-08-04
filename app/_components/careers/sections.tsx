import { JobCard } from "../cards";
import { JOBS } from "../../_content/jobs";

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
    <h1 className="display-careers-title pt-[66px] text-center font-serif sm:pt-[89px] lg:pt-[88px]">
      {/* Two block lines rather than one `<br>`: with both fonts on a single
          line box, Chrome unions the Newsreader strut with the taller Archivo
          inline box and the pair runs 8px past the authored leading. One block
          per line keeps each line box at exactly the leading. */}
      <span className="block">Careers at</span>
      <span className="block font-sans font-medium">Aetherfield</span>
    </h1>
  );
}

/* -------------------------------------------------------------------------- */
/*  Job list — 820 desktop cap, 16px gaps                                       */
/* -------------------------------------------------------------------------- */

/** 820 is the desktop cap; at 800 and 375 the container gutters take over
    (760 and 335), which is exactly what the comps measure. */
export function JobList() {
  return (
    <ul className="mx-auto mt-8 max-w-[820px] space-y-4">
      {JOBS.map((job) => (
        <li key={job.role}>
          <JobCard
            role={job.role}
            type={job.type}
            location={job.location}
            body={job.body}
            action={job.action}
            open={job.open}
          />
        </li>
      ))}
    </ul>
  );
}
