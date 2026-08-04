import Image from "next/image";
import { ARTICLES } from "../../_content/articles";
import { ArticleCardStacked } from "../cards";

/* -------------------------------------------------------------------------- */
/*  Masthead stamp                                                              */
/*                                                                              */
/*  The whole stamp interior is one SVG on a 1240×480 viewBox — the artwork      */
/*  measured off the desktop comp. Because the wrapper holds that exact ratio    */
/*  at every breakpoint, the perforations, the frame and the type all scale       */
/*  together and no value needs restating per breakpoint. Hand-sizing anything   */
/*  here is a sign of drift from the comp.                                       */
/* -------------------------------------------------------------------------- */

const STAMP_W = 1240;
const STAMP_H = 480;

/* 26 perforations across, half-circles centred on the corners. */
const PERF_COUNT = 26;
const PERF_PITCH = STAMP_W / (PERF_COUNT - 1);
const PERF_R = 15;

/* Inner rule, inset 20 across and 30 down. Drawn as an explicit path with a
   couple of pixels of wander per run: the comp's rule is visibly not ruled. */
const FRAME_PATH = [
  "M20 31",
  "Q170 28 320 30.5",
  "Q470 32.5 620 29.5",
  "Q770 27 920 31",
  "Q1070 33 1220 30",
  "Q1223 135 1218 240",
  "Q1214 345 1220 450",
  "Q1070 447 920 451",
  "Q770 454.5 620 450",
  "Q470 447 320 451.5",
  "Q170 455 20 450",
  "Q17 345 21 240",
  "Q24 135 20 31",
  "Z",
].join(" ");

/* Flattened diamond: sharp top and bottom apexes, rounded left and right tips.
   The tip control points overshoot to x=1123 / 117 because a quadratic only
   reaches halfway to its control — that lands the curve on the measured tips at
   x=1080 and x=160. */
const LOZENGE_PATH = [
  "M620 62",
  "L1037.1 223.4",
  "Q1123 240 1037 256.4",
  "L620 415",
  "L203 256.4",
  "Q117 240 202.9 223.4",
  "Z",
].join(" ");

const SANS = { fontFamily: "var(--font-sans)" };
const SERIF = { fontFamily: "var(--font-serif)" };

export function JournalStamp() {
  return (
    <div className="relative aspect-[1240/480] w-full">
      <Image
        src="/assets/generated/texture-journal.png"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      <svg
        viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
        role="img"
        aria-label="Aetherfield Journal"
        className="absolute inset-0 h-full w-full text-ink"
      >
        {/* Perforations. Painted white rather than masked — the page behind the
            stamp is white, so the result is identical and far simpler. */}
        <g fill="white">
          {Array.from({ length: PERF_COUNT }, (_, i) => {
            const cx = i * PERF_PITCH;
            return (
              <g key={i}>
                <circle cx={cx} cy={0} r={PERF_R} />
                <circle cx={cx} cy={STAMP_H} r={PERF_R} />
              </g>
            );
          })}
        </g>

        {/* The lozenge is drawn twice the weight of the frame, as in the comp. */}
        <g fill="none" stroke="currentColor">
          <path d={FRAME_PATH} strokeWidth="3" />
          <path d={LOZENGE_PATH} strokeWidth="6" strokeLinejoin="round" />
        </g>

        <g fill="currentColor" textAnchor="middle">
          <text x="620" y="114" fontSize="40" style={SERIF}>
            earth
          </text>
          <text x="249" y="250" fontSize="40" style={SERIF}>
            tech
          </text>
          <text x="991" y="250" fontSize="40" style={SERIF}>
            data
          </text>
          <text x="620" y="234" fontSize="64" fontWeight="700" style={SANS}>
            Aetherfield
          </text>
          <text x="620" y="294" fontSize="64" fontWeight="700" style={SANS}>
            Journal
          </text>
          {/* Newsreader sets ® high and small; 90/413 lands it on the comp. */}
          <text x="620" y="413" fontSize="90" style={SERIF}>
            ®
          </text>
        </g>
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Latest articles                                                             */
/* -------------------------------------------------------------------------- */

export function LatestArticles() {
  return (
    <section className="mb-14 md:mb-24 lg:mb-40">
      <h2 className="display-fluid-h4 mt-6 text-center font-sans font-bold md:mt-9 lg:mt-[76px]">
        Latest articles
      </h2>

      {/* Two columns from lg, with the comp's 16px column gutter. */}
      <div className="mt-10 grid grid-cols-1 gap-y-20 lg:grid-cols-2 lg:gap-x-4">
        {ARTICLES.map((article, i) => (
          <ArticleCardStacked
            key={article.title}
            article={article}
            href={`/article/${article.slug}`}
            priority={i < 2}
          />
        ))}
      </div>
    </section>
  );
}
