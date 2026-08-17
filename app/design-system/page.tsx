import type { Metadata } from "next";

import {
  ArticleCardCompact,
  ArticleCardHorizontal,
  ArticleCardStacked,
  JobCard,
  ValueCard,
  type Article,
} from "../_components/cards";
import { CtaBand, SiteFooter, SiteNav } from "../_components/chrome";
import {
  ArrowUpRight,
  Button,
  Field,
  LinkButton,
  Meta,
  MetaPair,
  Placeholder,
  SelectField,
} from "../_components/primitives";

/**
 * **The string that used to be the root default**, moved here at prompt 112 —
 * this is the page it was written for. Unchanged, word for word.
 */
export const metadata: Metadata = {
  title: "Aetherfield — Design System",
  description:
    "Foundations and components for Aetherfield, derived from the Styles reference.",
};

/**
 * The nine colour tokens, **named here and valued only in `@theme`.**
 *
 * Each row used to carry a `hex` literal, and the swatch was painted from that
 * literal — so the nine values were a hand-kept mirror of `@theme` in
 * `app/globals.css`, and re-fitting a token moved *nothing* on this page. The
 * page documenting the design system could report a colour the design system no
 * longer had. Prompt 117 removed the mirror rather than trying to keep it in
 * step: Tailwind v4 is config-less, `@theme` is the only place a colour is
 * valued, and there is no build-time API for reading it back (v4 dropped v3's
 * `resolveConfig`; the documented JS route is `getComputedStyle`, which is
 * client-side and would render nothing into this static page's HTML). So the
 * exhibit stops restating the value: it paints from the utility the token
 * generates and prints the token's name and its role.
 *
 * **`utility` is a literal string per row, deliberately.** Tailwind v4 only
 * emits what it finds in scanned source, so a `` `bg-${name}` `` template would
 * generate no class and the swatch would paint nothing.
 */
const SWATCHES = [
  { name: "ink", utility: "bg-ink", role: "Primary text, fills" },
  { name: "muted", utility: "bg-muted", role: "Meta, captions" },
  { name: "border", utility: "bg-border", role: "Hairlines, placeholders" },
  { name: "surface", utility: "bg-surface", role: "Tinted bands" },
  { name: "white", utility: "bg-white", role: "Page, cards" },
  { name: "accent-soft", utility: "bg-accent-soft", role: "Tints" },
  { name: "accent", utility: "bg-accent", role: "Links, focus" },
  { name: "brand", utility: "bg-brand", role: "Footer field" },
  { name: "brand-ink", utility: "bg-brand-ink", role: "Ink on brand" },
];

/* Sample content for the card specimens — the styleguide renders them inert,
   so the slug is never linked, but the type carries it. */
const ARTICLE: Article = {
  slug: "how-to-build-a-climate-ready-data-stack",
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
                className={`aspect-square w-full border border-border ${s.utility}`}
              />
              <p className="mt-3 font-sans text-[13px] leading-tight font-bold">
                {s.name}
              </p>
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

      {/* ---- Fields ---- */}
      <Section label="Components · Fields">
        <div className="grid max-w-[800px] gap-8 md:grid-cols-2">
          <Field
            id="field-example"
            label="Work email"
            type="email"
            placeholder="name@company.com"
            hint="Use the address associated with your account."
          />
          <Field
            id="field-error-example"
            label="Work email"
            type="email"
            defaultValue="not-an-email"
            error="Enter a valid email address."
          />
          {/* `SelectField` sits in this grid rather than in a section of its
              own, because the pairing is the lesson: the same label, hint and
              error chrome around a different control. Added by prompt 107,
              which found the primitive missing and fourteen selects hand-rolled
              in its absence — a primitive that is not in this exhibit is one the
              next session concludes does not exist. */}
          <SelectField
            id="select-example"
            label="Target coverage"
            hint="Biogenic and outside-of-scopes figures are always separate."
            defaultValue="scope_1_2"
          >
            <option value="scope_1_2">Scope 1 and 2</option>
            <option value="scope_1_2_3">Scope 1, 2 and 3</option>
          </SelectField>
          <SelectField
            id="select-error-example"
            label="Target coverage"
            defaultValue=""
            error="Choose the scopes this target covers."
          >
            <option value="">Select coverage</option>
            <option value="scope_1_2">Scope 1 and 2</option>
            <option value="scope_1_2_3">Scope 1, 2 and 3</option>
          </SelectField>
        </div>
      </Section>

      {/* ---- Cards ---- */}
      <Section label="Components · Article cards">
        <Row note="Stacked — image 612×356">
          <ArticleCardStacked article={ARTICLE} className="max-w-[612px]" />
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
        <CtaBand
          demo
          headline="Ready to operationalize your sustainability goals?"
        />
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
