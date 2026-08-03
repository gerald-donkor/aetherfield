import Image from "next/image";
import { Button, Meta } from "../primitives";
import { HeroDashboard } from "./dashboard";

/* Shared page container: 1232px content inside 24px gutters. */
export function Container({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Gutters measured from the comps: 20px up to tablet, 24px on desktop.
    <div className={`mx-auto w-full max-w-page px-5 lg:px-6 ${className}`}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section>
      <Container>
        <div className="pt-12 text-center md:pt-16 lg:pt-[76px]">
          {/* The comp breaks after "insights," at all three sizes, so the break
              is explicit. Sizes are measured per breakpoint: 36 / 64 / 80. */}
          <h1 className="mx-auto font-serif text-[clamp(30px,9vw,64px)] leading-[0.96] md:text-[64px] lg:text-[clamp(64px,6.25vw,80px)]">
            Sustainability insights,
            <br />
            built for business
          </h1>
          <p className="mx-auto mt-6 max-w-[720px] font-serif text-p2">
            Track impact, reduce emissions, and accelerate progress—with clarity
            and confidence.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button>Request a demo</Button>
            <Button>Explore the platform</Button>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-[960px] md:mt-16">
          <HeroDashboard />
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Capabilities — the Track → Model → Report → Act sequence                    */
/* -------------------------------------------------------------------------- */

const CAPABILITIES = [
  ["Track", "Emissions, energy, and waste across your value chain"],
  ["Model", "Forecast performance and goal alignment"],
  ["Report", "Generate ESG disclosures, automate frameworks"],
  ["Act", "Surface insights and operational next steps"],
];

export function Capabilities() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <h2 className="display-fluid-h4 mx-auto max-w-[600px] text-center font-sans font-bold">
          Everything you need to measure, model, and act on sustainability
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Image with the floating metric card */}
          <div className="relative aspect-[692/566] w-full">
            <Image
              src="/assets/images/Image-3.png"
              alt="Sheer fabric lifting against an open sky"
              fill
              sizes="(max-width: 1024px) 100vw, 620px"
              className="object-cover"
            />
            <div className="@container absolute inset-x-[8%] top-1/2 -translate-y-1/2 lg:inset-x-[16%]">
              <div className="bg-white p-[4.5cqw] text-[2.6cqw]">
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[1em]">
                    Energy consumption
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    className="size-[2.4em]"
                    aria-hidden
                  >
                    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
                  </svg>
                </div>
                <div className="mt-[3em] flex items-baseline justify-between">
                  <p className="font-sans text-[2.6em] leading-none font-bold">
                    583.7
                    <span className="ml-[0.3em] text-[0.42em]">MWh</span>
                  </p>
                  <span className="font-mono text-[1em] text-accent">
                    ↓12.4%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Numbered sequence */}
          <div className="flex flex-col">
            <ol className="border-t border-border">
              {CAPABILITIES.map(([name, detail], i) => (
                <li key={name} className="border-b border-border py-5">
                  <div className="flex items-baseline justify-between gap-6">
                    <h3 className="font-sans text-p1 font-bold">{name}</h3>
                    <span className="font-mono text-caption text-muted">
                      {String(i + 1).padStart(3, "0")}
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-p2">{detail}</p>
                </li>
              ))}
            </ol>
            <Button className="mt-8 w-full lg:w-auto lg:self-start">
              Explore features
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Principles — cream fabric section                                           */
/* -------------------------------------------------------------------------- */

const PRINCIPLES = [
  {
    title: "Clarity drives action",
    body: "We believe better decisions start with better data—measured, visible, and trusted.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M12 12h9" />
      </>
    ),
  },
  {
    title: "Sustainability is a systems problem",
    body: "We build tools that help teams connect the dots between operations, impact, and accountability.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9S9.5 5.4 12 3Z" />
      </>
    ),
  },
  {
    title: "Progress over perfection",
    body: "We support real-world momentum—helping organizations move from ambition to measurable change.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 15l6-6M10 9h5v5" />
      </>
    ),
  },
];

export function Principles() {
  return (
    <section className="cream-fabric py-16 md:py-20">
      <Container>
        {/* Measured per breakpoint: 36 / 62 / 76 — a notch below the 80px H1. */}
        <h2 className="text-center text-[36px] leading-[1.02] md:text-[62px] lg:text-[clamp(62px,5.9vw,76px)]">
          <span className="block font-serif">Built for clarity</span>
          <span className="block font-sans font-bold tracking-[-0.01em]">
            Designed for action
          </span>
        </h2>

        <ul className="mt-10 grid gap-6 md:mt-12 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <li
              key={p.title}
              className="flex flex-col rounded-card bg-white p-8 md:p-10"
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
              <h3 className="mt-8 font-sans text-p1 font-bold">{p.title}</h3>
              <p className="mt-2 font-serif text-p2">{p.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Case study                                                                  */
/* -------------------------------------------------------------------------- */

export function CaseStudy() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        {/* Two columns from tablet up, as in the comps; stacks on mobile. */}
        <div className="grid items-center gap-6 rounded-card bg-surface p-5 md:grid-cols-[360px_1fr] md:gap-8 md:p-6 lg:grid-cols-[496px_1fr] lg:gap-10">
          <Image
            src="/assets/generated/case-study-duotone.jpg"
            alt="Three colleagues meeting outdoors, rendered as a blue halftone"
            width={992}
            height={556}
            sizes="(max-width: 1024px) 100vw, 496px"
            className="h-full w-full object-cover"
          />
          <div className="lg:pr-20">
            <h2 className="font-sans text-p1 font-bold">
              Why Acme Inc chose Aetherfield
            </h2>
            <p className="mt-4 font-serif text-p2">
              With fragmented data and growing reporting pressure, Acme turned
              to Aetherfield to streamline their ESG workflows. The result?
              Faster decisions, fewer spreadsheets, and 34% more coverage.
            </p>
            <Button
              size="secondary"
              bullet={false}
              className="mt-6 w-full sm:w-auto"
            >
              Read case study
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Journal                                                                     */
/* -------------------------------------------------------------------------- */

const ARTICLES = [
  {
    title: "How to Build a Climate-Ready Data Stack",
    category: "Insights",
    readTime: "4 min",
    src: "/assets/images/Image-3.png",
  },
  {
    title: "Sustainability Isn't a Side Project: Making Impact Operational",
    category: "Strategy",
    readTime: "7 min",
    src: "/assets/images/Image-7.png",
  },
  {
    title: "Inside the Aetherfield Model: How We Turn Data Into Action",
    category: "Insights",
    readTime: "5 min",
    src: "/assets/images/Image-6.png",
  },
];

/** The Journal mark: a flattened diamond with the masthead set inside it. */
function JournalMark() {
  return (
    <svg
      viewBox="0 0 400 200"
      fill="none"
      className="w-full text-accent"
      aria-label="Aetherfield Journal"
      role="img"
    >
      <path
        d="M200 6 394 100 200 194 6 100Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <text
        x="200"
        y="92"
        textAnchor="middle"
        fill="currentColor"
        fontSize="34"
        fontWeight="700"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Aetherfield
      </text>
      <text
        x="200"
        y="128"
        textAnchor="middle"
        fill="currentColor"
        fontSize="34"
        fontWeight="700"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        Journal
      </text>
      <text
        x="82"
        y="104"
        textAnchor="middle"
        fill="currentColor"
        fontSize="15"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        tech
      </text>
      <text
        x="200"
        y="44"
        textAnchor="middle"
        fill="currentColor"
        fontSize="15"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        earth
      </text>
      <text
        x="318"
        y="104"
        textAnchor="middle"
        fill="currentColor"
        fontSize="15"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        data
      </text>
      <text
        x="200"
        y="163"
        textAnchor="middle"
        fill="currentColor"
        fontSize="15"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        ®
      </text>
    </svg>
  );
}

export function Journal() {
  return (
    <section className="pb-20 md:pb-28">
      <Container>
        <div className="md:grid md:grid-cols-[190px_1fr] md:items-start md:gap-8 lg:grid-cols-[1fr_2fr] lg:gap-10">
          {/* Tilted as drawn in the comps. On tablet it hangs off the left
              gutter; on mobile it is dropped, where it would crowd the list. */}
          <div className="hidden md:-mt-4 md:-ml-24 md:block md:w-[290px] md:-rotate-[8deg] lg:mt-0 lg:ml-0 lg:w-auto">
            <JournalMark />
          </div>

          <div>
            <h2 className="display-fluid-h4 text-center font-sans font-bold md:text-left">
              From the journal
            </h2>
            <ul className="mt-6 border-t border-border">
              {ARTICLES.map((a) => (
                <li key={a.title} className="border-b border-border py-5">
                  <a
                    href="#"
                    className="group grid gap-4 md:grid-cols-[164px_1fr] md:items-start md:gap-6"
                  >
                    <Image
                      src={a.src}
                      alt=""
                      width={328}
                      height={200}
                      sizes="(max-width: 768px) 100vw, 164px"
                      className="aspect-[164/100] w-full object-cover"
                    />
                    <div>
                      <h3 className="font-sans text-p1 font-bold group-hover:underline">
                        {a.title}
                      </h3>
                      <Meta className="mt-2" items={[a.category, a.readTime]} />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-center">
              <Button
                size="secondary"
                bullet={false}
                className="w-full sm:w-auto"
              >
                View all articles
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Testimonial                                                                 */
/* -------------------------------------------------------------------------- */

export function Testimonial() {
  return (
    <section className="pb-20 md:pb-28">
      <Container className="grid items-center gap-8 md:grid-cols-[372px_1fr] md:gap-14 lg:grid-cols-[608px_1fr] lg:gap-[120px]">
        <Image
          src="/assets/generated/testimonial-duotone.jpg"
          alt="Elliot Williams, rendered as a blue halftone portrait"
          width={1000}
          height={1151}
          sizes="(max-width: 1024px) 100vw, 608px"
          className="w-full object-cover"
        />
        <div className="lg:max-w-[400px]">
          <span
            aria-hidden
            className="block font-serif text-[44px] leading-none text-border"
          >
            &ldquo;
          </span>
          <blockquote className="mt-4">
            <p className="display-fluid-h4 font-sans font-bold text-balance">
              We finally moved past spreadsheets and guesswork. Now we have real
              data to guide real decisions.
            </p>
            <footer className="mt-8">
              <p className="font-sans text-p1 font-bold">Elliot Williams</p>
              <p className="mt-1 font-serif text-p2 text-muted">
                Head of Sustainability, Flux Materials
              </p>
            </footer>
          </blockquote>
        </div>
      </Container>
    </section>
  );
}
