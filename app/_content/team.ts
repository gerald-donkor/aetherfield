/**
 * The roster behind "Meet the team" on `/about`. The section renders a list, so
 * the list is data — the same split `_content/articles.ts` and `_content/jobs.ts`
 * make for the journal and for careers.
 *
 * Transcribed from `public/assets/pages/09-about/screen-sizes/Desktop.png`, in
 * the comp's row order. Straight apostrophes, per the convention the six
 * articles already ship — `Will O'Watt` depends on it.
 *
 * The fields are named rather than positional: `[name, title, email]` is three
 * interchangeable strings, so a transposed pair puts a job title in the email
 * column and nothing catches it.
 */
export type TeamMember = {
  name: string;
  title: string;
  /** Rendered as a `mailto:` link, and the row key. */
  email: string;
};

export const TEAM: TeamMember[] = [
  { name: "Eunji Park", title: "Founder", email: "e.park@aetherfield.com" },
  {
    name: "Al Gorithm",
    title: "Senior Systems Architect",
    email: "a.gorithm@aetherfield.com",
  },
  {
    name: "Cassandra Query",
    title: "Head of Data Platforms",
    email: "c.query@aetherfield.com",
  },
  {
    name: "Sue Logic",
    title: "Principal Software Engineer",
    email: "s.logic@aetherfield.com",
  },
  {
    name: "Dash Bordman",
    title: "Product Manager",
    email: "d.bordman@aetherfield.com",
  },
  {
    name: "Greta Watt",
    title: "Director of Climate Strategy",
    email: "g.watt@aetherfield.com",
  },
  {
    name: "Gail Force",
    title: "Environmental Risk Analyst",
    email: "g.force@aetherfield.com",
  },
  {
    name: "Polly Nation",
    title: "UX Designer",
    email: "p.nation@aetherfield.com",
  },
  {
    name: "Will O'Watt",
    title: "Clean Energy Solutions Manager",
    email: "w.owatt@aetherfield.com",
  },
  // "Earth Systems Research" and "Earth Systems Researcher" are both in the
  // comp, on consecutive rows. Transcribed as drawn.
  {
    name: "Lana Terra",
    title: "Earth Systems Research",
    email: "l.terra@aetherfield.com",
  },
  {
    name: "Ella Vation",
    title: "Earth Systems Researcher",
    email: "e.vation@aetherfield.com",
  },
  {
    name: "Phil Scope",
    title: "Lifecycle Assessment Lead",
    email: "p.scope@aetherfield.com",
  },
];
