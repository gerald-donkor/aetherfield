import {
  ArticleCardCompact,
  ArticleCardHorizontal,
  ArticleCardStacked,
  JobCard,
  ValueCard,
  type Article,
} from "./_components/cards";
import { CtaBand, SiteFooter, SiteNav } from "./_components/chrome";
import {
  ArrowUpRight,
  Button,
  LinkButton,
  Meta,
  MetaPair,
  Placeholder,
} from "./_components/primitives";

const SWATCHES = [
  { name: "ink", hex: "#000000", role: "Primary text, fills" },
  { name: "muted", hex: "#6C6C6C", role: "Meta, captions" },
  { name: "border", hex: "#DBE0EC", role: "Hairlines, placeholders" },
  { name: "surface", hex: "#F6F8FB", role: "Tinted bands" },
  { name: "white", hex: "#FFFFFF", role: "Page, cards" },
  { name: "accent-soft", hex: "#ADD5FD", role: "Tints" },
  { name: "accent", hex: "#2683EB", role: "Links, focus" },
  { name: "brand", hex: "#FFF546", role: "Footer field" },
  { name: "brand-ink", hex: "#66640F", role: "Ink on brand" },
];

const ARTICLE: Article = {
  title: "How to Build a Climate-Ready Data Stack",
  category: "Tooling",
  readTime: "4 min",
  description:
    "A practical guide for sustainability teams on integrating emissions, waste, and energy data into modern workflows.",
};

/* Section scaffold ---------------------------------------------------------- */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-rule py-16">
      <p className="mb-12 font-mono text-caption text-muted">{label}</p>
      {children}
    </section>
  );
}

function Row({ note, children }: { note?: string; children: React.ReactNode }) {
  return (
    <div className="mb-14 last:mb-0">
      {note ? (
        <p className="mb-4 font-mono text-caption text-muted">{note}</p>
      ) : null}
      {children}
    </div>
  );
}

function TypeSpec({
  spec,
  children,
}: {
  spec: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-baseline lg:gap-10">
      <p className="order-last shrink-0 font-mono text-[12px] text-muted lg:order-first lg:w-[210px]">
        {spec}
      </p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const PLUS = (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className="size-6"
    aria-hidden
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const CLOSE = (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className="size-6"
    aria-hidden
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const ARROW = (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
    aria-hidden
  >
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

/* Page ---------------------------------------------------------------------- */

export default function Page() {
  return (
    <div className="mx-auto max-w-frame px-5 sm:px-10">
      <SiteNav />

      {/* ---- Masthead ---- */}
      <section className="border-t border-rule py-20">
        <p className="font-mono text-caption text-muted">
          Aetherfield · Design System v1
        </p>
        <h1 className="display-fluid-h1 mt-8 max-w-[15ch] font-serif leading-[1.05] text-balance">
          Clarity drives action.
        </h1>
        <p className="mt-8 max-w-[52ch] font-serif text-p2">
          Three families, each with one job: a serif for editorial voice and
          prose, a grotesk for structure, and a mono for anything machine-read —
          timestamps, locations, read-times, buttons.
        </p>
      </section>

      {/* ---- Type ---- */}
      <Section label="Text Styles">
        <div className="space-y-12">
          <TypeSpec spec="Serif · 80 / 1.05">
            <p className="display-fluid-h1 font-serif leading-[1.05]">
              Header 1
            </p>
          </TypeSpec>
          <TypeSpec spec="Sans · 80 / 1.0 · Bold">
            <p className="display-fluid-h2 font-sans leading-none font-bold">
              Header 2
            </p>
          </TypeSpec>
          <TypeSpec spec="Sans · 56 / 1.0 · Bold">
            <p className="display-fluid-h3 font-sans leading-none font-bold">
              Header 3
            </p>
          </TypeSpec>
          <TypeSpec spec="Sans · 40 / 1.0 · Bold">
            <p className="display-fluid-h4 font-sans leading-none font-bold">
              Header 4
            </p>
          </TypeSpec>
          <TypeSpec spec="Sans · 20 / 24 · Bold">
            <p className="font-sans text-p1 font-bold">Paragraph 1 (Bold)</p>
          </TypeSpec>
          <TypeSpec spec="Sans · 20 / 24 · Regular">
            <p className="font-sans text-p1">Paragraph 1 (Regular)</p>
          </TypeSpec>
          <TypeSpec spec="Serif · 20 / 24 — all prose">
            <p className="font-serif text-p2">Paragraph 2</p>
          </TypeSpec>
          <TypeSpec spec="Sans · 16 · Bold">
            <p className="font-sans text-nav font-bold">Nav link</p>
          </TypeSpec>
          <TypeSpec spec="Mono · 14 · Medium">
            <p className="font-mono text-button font-medium">Button text</p>
          </TypeSpec>
          <TypeSpec spec="Mono · 14 · muted">
            <p className="font-mono text-caption text-muted">Caption</p>
          </TypeSpec>
        </div>
      </Section>

      {/* ---- Colour ---- */}
      <Section label="Color">
        <ul className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-5 lg:grid-cols-9">
          {SWATCHES.map((s) => (
            <li key={s.name}>
              <div
                style={{ backgroundColor: s.hex }}
                className="aspect-square w-full border border-border"
              />
              <p className="mt-3 font-sans text-[13px] leading-tight font-bold">
                {s.name}
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted">{s.hex}</p>
              <p className="mt-1 font-serif text-[13px] leading-tight text-muted">
                {s.role}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---- Buttons ---- */}
      <Section label="Components · Buttons">
        <Row note="Primary — 164×46, bullet marks the highest-intent action">
          <Button>Request a demo</Button>
        </Row>
        <Row note="Secondary — 159×38, no bullet">
          <Button size="secondary">Watch case study</Button>
        </Row>
        <Row note="Compact — 100×38, used inside cards">
          <Button size="compact">View role</Button>
        </Row>
        <Row note="Link — sans 16/700, arrow slides on hover">
          <LinkButton href="#">Get started</LinkButton>
        </Row>
      </Section>

      {/* ---- Cards ---- */}
      <Section label="Components · Article cards">
        <Row note="Stacked — image 612×356">
          <ArticleCardStacked article={ARTICLE} />
        </Row>
        <Row note="Horizontal — 620×150">
          <ArticleCardHorizontal article={ARTICLE} />
        </Row>
        <Row note="Compact — 375×335">
          <ArticleCardCompact article={ARTICLE} />
        </Row>
      </Section>

      {/* ---- Metadata ---- */}
      <Section label="Components · Metadata">
        <Row note="Pair — serif label over sans value">
          <dl className="flex flex-wrap gap-x-16 gap-y-6 border-t border-border pt-6">
            <MetaPair label="Published" value="July 1, 2025" />
            <MetaPair label="Author" value="Al Gorithm" />
          </dl>
        </Row>
        <Row note="Byline row — hairline top and bottom">
          <div className="flex flex-col gap-2 border-y border-border py-4 sm:flex-row sm:items-baseline sm:justify-between">
            <p className="font-sans text-p1 font-bold">John McClelland</p>
            <p className="font-serif text-p2 text-muted">
              Director of Technology
            </p>
            <p className="font-serif text-p2 text-muted">
              jmcclelland@aetherfield.com
            </p>
          </div>
        </Row>
        <Row note="Inline meta — mono with middot separator">
          <Meta items={["Tooling", "4 min"]} />
        </Row>
      </Section>

      {/* ---- Value + job cards ---- */}
      <Section label="Components · Content cards">
        <Row note="Value card — 400×246, radius 16, plain and tinted">
          <div className="flex flex-wrap gap-6">
            <ValueCard
              title="Clarity drives action"
              body="We believe better decisions start with better data—measured, visible, and trusted."
            />
            <ValueCard
              tinted
              title="Clarity drives action"
              body="We believe better decisions start with better data—measured, visible, and trusted."
            />
          </div>
        </Row>
        <Row note="Job card — 820×194, radius 16">
          <JobCard
            role="Data Scientist"
            type="Full-time"
            location="Denver, CO"
            body="Help build the intelligence layer for climate action. You'll turn complex sustainability data into clear, actionable insights for enterprise teams."
          />
        </Row>
      </Section>

      {/* ---- Icons + placeholder ---- */}
      <Section label="Assets">
        <Row note="Icons — 24px grid, 1px stroke">
          <div className="flex items-center gap-6 text-ink">
            {[
              <ArrowUpRight key="a" className="size-6" />,
              PLUS,
              CLOSE,
              ARROW,
            ].map((icon, i) => (
              <span
                key={i}
                className="flex size-12 items-center justify-center rounded-full border border-ink"
              >
                {icon}
              </span>
            ))}
          </div>
        </Row>
        <Row note="Image placeholder — --color-border">
          <div className="max-w-[400px]">
            <Placeholder />
          </div>
        </Row>
      </Section>

      {/* ---- Composed ---- */}
      <Section label="Components · CTA band">
        <CtaBand headline="Ready to operationalize your sustainability goals?" />
      </Section>

      <Section label="Components · Footer">
        <SiteFooter />
      </Section>

      <div className="border-t border-rule py-10">
        <p className="font-mono text-caption text-muted">
          End · Aetherfield design system
        </p>
      </div>
    </div>
  );
}
