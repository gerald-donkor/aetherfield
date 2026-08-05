import Image from "next/image";
import { ButtonLink } from "../primitives";
import { Container, PRINCIPLES } from "../home/sections";

/* -------------------------------------------------------------------------- */
/*  Hero — sky band with the floating Forecast card, mission copy beside it     */
/* -------------------------------------------------------------------------- */

/**
 * The Forecast card, as a single scaling panel.
 *
 * The comps do not lay this out per breakpoint: the box is 269×96 / 574×204 /
 * 460×164 against bands of 375×320 / 800×480 / 632×800, i.e. 0.717 / 0.718 /
 * 0.728 of the band width at a constant 2.80 aspect, centred both ways in the
 * band at all three. So it is one `@container` panel sized in `cqw`, with every
 * interior dimension in `em` against a `1cqw` root — the same rule `HeroDashboard`
 * follows.
 *
 * The markup started from the dashboard's Forecast tile but is deliberately a
 * copy: that tile is a fixed-height grid cell inside the hero mockup, this is a
 * standalone panel with a different aspect and an extra footer line. Making the
 * tile configurable for one caller costs more than the twenty lines.
 */
function ForecastCard() {
  return (
    <div className="@container relative w-[71.8%]">
      {/* Two sheets peeking below, measured off Desktop.png -crop 640x260+0+300:
          the card is 460 wide at x 86, the first sheet runs x 101…531 and 14px
          below the card's bottom edge, the second x 114…518 and 14px below that
          — so 3.0 % / 6.1 % of the card width inset per side, at a 3.04 % peek
          each. Both are white at a reduced opacity over the sky. */}
      <div className="absolute inset-x-[3.0%] top-0 h-[calc(100%+3.04cqw)] rounded-[3.5cqw] bg-white/45" />
      <div className="absolute inset-x-[6.1%] top-0 h-[calc(100%+6.09cqw)] rounded-[3.5cqw] bg-white/30" />

      <div className="relative flex aspect-[2.8/1] gap-[4.35em] rounded-[3.5em] bg-white p-[2.17em] text-[1cqw] shadow-[0_18px_40px_rgba(23,54,90,0.10)]">
        <div className="relative aspect-square h-full shrink-0 overflow-hidden">
          <Image
            src="/assets/images/Image-7.png"
            alt=""
            fill
            sizes="(max-width: 768px) 90px, 190px"
            className="object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-[2.17em]">
          {/* Padding is in the pill's own em, not the card's: an `em` length on
              the element that also sets `font-size` resolves against that new
              size. 0.97/0.51em is the comp's 11.5×6px at this 11.8px type. */}
          <span className="self-start rounded-full bg-brand px-[0.97em] py-[0.51em] font-mono text-[2.6em] leading-none text-brand-ink">
            Forecast
          </span>
          <p className="font-sans text-[4.35em] leading-[1.1] font-bold">
            You&apos;re 16% off your 2027 emissions goal
          </p>
          <span className="font-mono text-[2.6em] leading-none text-muted">
            Adjust your targets →
          </span>
        </div>
      </div>
    </div>
  );
}

export function AboutHero() {
  return (
    // Pulled up under the 60px bar. The comps measure the band from the very
    // top of the artboard and centre the card in it, but SiteNav is sticky and
    // so takes 60px of flow; without this the card and the mission column both
    // sit 60px low. The bar is transparent glass over the band, as on the comp.
    <section className="-mt-[60px] lg:flex lg:items-center">
      {/* Matches the sky band exactly — 375×320 / 800×480 / 632×800, the last
          being 49.375 % of the 1280 artboard. The band itself is painted by a
          document-level absolute sibling in page.tsx; this box only holds the
          card in the middle of it. */}
      <div className="flex h-[320px] w-full items-center justify-center md:h-[480px] lg:h-[800px] lg:w-[49.375%] lg:shrink-0">
        <ForecastCard />
      </div>

      {/* The column runs x 712…1256 on the desktop comp — 544 wide, flush with
          the page gutter, the 80px gap absorbed on the left. Tablet indents it
          130 from the artboard edge; mobile fills the gutters. */}
      <div className="lg:min-w-0 lg:flex-1 lg:pl-20">
        <div className="px-5 pt-8 md:pt-[84px] md:pl-[130px] lg:p-0">
          <div className="md:max-w-[544px]">
            <p className="font-serif text-p2 text-muted">Our mission</p>
            <h1 className="display-fluid-h4 mt-4 font-sans font-bold">
              Climate action starts with better information. We help
              organizations turn complex data into measurable, meaningful
              change.
            </h1>
            {/* A link, not a form control — so the Button look on an <a>
                rather than a <button> nested in one. */}
            <ButtonLink href="#team" className="mt-9 w-full sm:w-auto">
              Meet the team
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Our values — the homepage's three principles, on surface cards             */
/* -------------------------------------------------------------------------- */

export function Values() {
  return (
    <section className="pt-10 pb-10 md:pt-20 md:pb-[118px] lg:pt-[118px] lg:pb-40">
      <Container>
        <h2 className="display-fluid-h4 text-center font-sans font-bold">
          Our values
        </h2>
        <ul className="mt-8 grid gap-4 md:mt-10 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <li
              key={p.title}
              className="flex flex-col rounded-card bg-surface p-10"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-12"
                aria-hidden
              >
                {p.icon}
              </svg>
              <h3 className="mt-5 font-sans text-p1 font-bold">{p.title}</h3>
              <p className="mt-2 font-serif text-p2">{p.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Founder's story                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The seal that overlaps the portrait's top-left corner.
 *
 * One scaling SVG on a single measured viewBox, in the spirit of `JournalStamp`
 * on /journal: nothing inside it is sized per breakpoint, which is why the
 * desktop and tablet comps agree without a second set of numbers.
 *
 * **Not `primitives.Seal`.** That mark — fitted on the job-listing comp — has
 * all three ellipses tangent at one top and one bottom vertex, and sets "earth"
 * right of the ® and "tech" above "data". This comp draws neither: its three
 * ellipses are separated at the top (apexes 17px apart) and its type is
 * symmetric about one axis. So the two are different marks, not one mark at two
 * angles, and this one stays local.
 *
 * Fitted against `Desktop.png -crop 300x170+0+1320`. The ellipses are not
 * axis-aligned there — their horizontal chord midpoints drift with y, "data"
 * sits 30px above "tech" and "earth" 15px left of the ®. All three fall out of
 * one rotation: the earth/® pair gives 7.4°, the tech/data pair 6.7°. So the
 * mark is drawn symmetric and rotated -6.6°, and un-rotating the measured
 * landmarks by that much puts "earth" and "®" on one vertical axis (x 148.5 ±
 * 0.4) and "tech"/"data" on one horizontal (y 76.0 / 76.1).
 *
 * In that frame: centre (150, 80); radii from the y=1400 chords and the apexes
 * at x=128 — 63×60 (all but circular), 102×72, 150×78, i.e. widest is flattest.
 * The rotated bounding box is 298.6×158.8, hence the 300×160 viewBox; the
 * mark's own left edge then lands ~22px left of the page gutter, which is the
 * clip the comp shows.
 */
function AetherfieldSeal() {
  const serif = { fontFamily: "var(--font-serif)" } as const;
  const sans = { fontFamily: "var(--font-sans)" } as const;
  return (
    <svg
      viewBox="0 0 300 160"
      fill="none"
      className="w-full text-accent"
      role="img"
      aria-label="Aetherfield — earth, data, tech"
    >
      <g transform="rotate(-6.6 150 80)">
        <g stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="150" cy="80" rx="150" ry="78" />
          <ellipse cx="150" cy="80" rx="102" ry="72" />
          <ellipse cx="150" cy="80" rx="63" ry="60" />
        </g>
        <g fill="currentColor" textAnchor="middle">
          <text x="150" y="21.5" fontSize="15" style={serif}>
            earth
          </text>
          <text x="280" y="79" fontSize="15" style={serif}>
            data
          </text>
          <text x="20" y="79" fontSize="15" style={serif}>
            tech
          </text>
          <text x="150" y="71" fontSize="25" fontWeight="700" style={sans}>
            Aether
          </text>
          <text x="150" y="96" fontSize="25" fontWeight="700" style={sans}>
            field
          </text>
          <text x="150" y="138" fontSize="22" style={serif}>
            ®
          </text>
        </g>
      </g>
    </svg>
  );
}

export function FounderStory() {
  return (
    <section className="pb-11 md:pb-20 lg:pb-[120px]">
      <Container className="md:grid md:grid-cols-[372px_1fr] md:items-center md:gap-14 lg:grid-cols-[612px_1fr] lg:gap-[120px]">
        <div className="relative">
          {/* Hangs off the left page gutter, as JournalMark does on the
              homepage, and dropped below md for the same reason: Mobile.png
              draws the portrait with no mark over it. The offsets are the
              comp's — desktop puts the seal's viewBox origin at page (-22,
              1328) against a portrait at (20, 1406); tablet scales the mark to
              0.807 (measured off its "Aether") and re-places it by hand rather
              than scaling the offset, which is what that comp shows. */}
          <div className="absolute -top-[80px] -left-[70px] z-10 hidden w-[242px] md:block lg:-top-[78px] lg:-left-[46px] lg:w-[300px]">
            <AetherfieldSeal />
          </div>
          <Image
            src="/assets/generated/about-founder.png"
            alt="Eunji Park, rendered as a blue halftone cut-out over the hero sky"
            width={612}
            height={700}
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 372px, 612px"
            className="w-full"
          />
        </div>

        <div className="mt-6 md:mt-0 lg:max-w-[400px]">
          <p className="font-serif text-p2 text-muted">Founder&apos;s story</p>
          <h2 className="display-band-h2 mt-2 font-sans font-bold">
            Eunji Park
          </h2>
          <p className="mt-12 font-serif text-p2">
            Eunji founded Aetherfield with one goal: to help companies take
            climate action without waiting for a perfect plan. With a background
            in environmental systems and software design, she&apos;s spent the
            past decade building tools that turn impact goals into real-world
            outcomes. She still insists on biking to every investor meeting.
          </p>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Meet the team                                                              */
/* -------------------------------------------------------------------------- */

const TEAM = [
  ["Eunji Park", "Founder", "e.park@aetherfield.com"],
  ["Al Gorithm", "Senior Systems Architect", "a.gorithm@aetherfield.com"],
  ["Cassandra Query", "Head of Data Platforms", "c.query@aetherfield.com"],
  ["Sue Logic", "Principal Software Engineer", "s.logic@aetherfield.com"],
  ["Dash Bordman", "Product Manager", "d.bordman@aetherfield.com"],
  ["Greta Watt", "Director of Climate Strategy", "g.watt@aetherfield.com"],
  ["Gail Force", "Environmental Risk Analyst", "g.force@aetherfield.com"],
  ["Polly Nation", "UX Designer", "p.nation@aetherfield.com"],
  ["Will O'Watt", "Clean Energy Solutions Manager", "w.owatt@aetherfield.com"],
  // "Earth Systems Research" and "Earth Systems Researcher" are both in the
  // comp, on consecutive rows. Transcribed as drawn.
  ["Lana Terra", "Earth Systems Research", "l.terra@aetherfield.com"],
  ["Ella Vation", "Earth Systems Researcher", "e.vation@aetherfield.com"],
  ["Phil Scope", "Lifecycle Assessment Lead", "p.scope@aetherfield.com"],
] as const;

export function TeamTable() {
  return (
    <section
      id="team"
      className="bg-surface py-10 md:py-20 lg:pt-[120px] lg:pb-[126px]"
    >
      <Container>
        <h2 className="display-band-h2 font-sans font-bold">Meet the team</h2>

        {/* One table at every width. Below md the header row and the cell
            layout are dropped with CSS — each row becomes a stacked block —
            rather than shipping the roster twice. */}
        <table className="mt-7 w-full text-left md:mt-[52px]">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border">
              <th
                scope="col"
                className="pb-3 font-mono text-caption font-normal"
              >
                Name
              </th>
              <th
                scope="col"
                className="pb-3 font-mono text-caption font-normal"
              >
                Title
              </th>
              <th
                scope="col"
                className="pb-3 text-right font-mono text-caption font-normal"
              >
                Contact
              </th>
            </tr>
          </thead>
          <tbody>
            {TEAM.map(([name, title, email]) => (
              <tr
                key={email}
                className="block border-t border-border pt-6 pb-8 md:table-row md:border-t-0 md:border-b md:pt-0 md:pb-0"
              >
                <td className="block font-sans text-p1 font-bold md:table-cell md:w-[33.5%] md:py-4">
                  {name}
                </td>
                <td className="mt-4 block font-serif text-p2 md:mt-0 md:table-cell md:py-4">
                  {title}
                </td>
                <td className="mt-4 block font-serif text-p2 md:mt-0 md:table-cell md:py-4 md:text-right">
                  <a href={`mailto:${email}`} className="underline">
                    {email}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Container>
    </section>
  );
}
