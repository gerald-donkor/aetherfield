/**
 * Open roles behind `/careers`. The page renders a list, so the list is data —
 * the same split `_content/articles.ts` makes for the journal.
 *
 * Transcribed from `public/assets/pages/10-careers/screen-sizes/Desktop.png`.
 * Straight apostrophes, per the convention the six articles already ship.
 */
export type Job = {
  /** Route key for `/job-listing/[slug]` — the role, slugified. */
  slug: string;
  role: string;
  type: string;
  location: string;
  body: string;
  /** Label on the card's action. */
  action: string;
  /** The open-application card is drawn as a dashed outline, not a white card. */
  open?: boolean;
};

export const JOBS: Job[] = [
  {
    slug: "ux-designer",
    role: "UX Designer",
    type: "Contract",
    location: "San Francisco, CA",
    body: "Shape the tools that drive climate intelligence. You'll lead cross-functional teams to build thoughtful, scalable solutions for sustainability-forward organizations.",
    action: "View role",
  },
  {
    slug: "data-scientist",
    role: "Data Scientist",
    type: "Full-time",
    location: "Denver, CO",
    body: "Help build the intelligence layer for climate action. You'll turn complex sustainability data into clear, actionable insights for enterprise teams.",
    action: "View role",
  },
  {
    slug: "product-manager",
    role: "Product Manager",
    type: "Part-time",
    location: "Seattle, WA",
    // The comp repeats the UX Designer body verbatim on this card.
    body: "Shape the tools that drive climate intelligence. You'll lead cross-functional teams to build thoughtful, scalable solutions for sustainability-forward organizations.",
    action: "View role",
  },
  {
    slug: "open-application",
    role: "Open application",
    // Shipped as drawn: the comp gives the open-application card a real role's
    // meta line. It reads like placeholder left in by mistake, but the comp is
    // the source of truth — drop this line if the designer confirms.
    type: "Full-time",
    location: "Denver, CO",
    body: "Don't see your role available? Apply for an open application!",
    action: "Apply now",
    open: true,
  },
];

/**
 * Prose behind `/job-listing/[slug]`, kept out of `JOBS` for the reason
 * `ARTICLE_BODIES` exists: `/careers` renders cards, not prose, and should not
 * ship copy it never draws.
 *
 * Transcribed from `public/assets/pages/11-job-listing1/screen-sizes/Desktop.png`
 * at 190 %. Straight apostrophes, per the convention the six articles ship.
 */
export type JobBody = {
  /** Standfirst above the rule. The comp repeats the card body verbatim, so it
      defaults to `Job.body` rather than being retyped — the two cannot drift. */
  lede?: string;
  sections: { heading: string; body?: string; items?: string[] }[];
  /** Closing call to action, inside the card above the second Apply button. */
  cta: string;
};

export const JOB_BODIES: Record<string, JobBody> = {
  "data-scientist": {
    sections: [
      {
        heading: "Company description",
        body: "At Aetherfield, we build software that empowers companies to lead with climate accountability. Our platform helps sustainability and operations teams make sense of complex environmental data—transforming emissions, waste, and energy metrics into measurable, meaningful action. We're a mission-driven team of technologists, designers, and scientists working to accelerate the shift toward a low-carbon future.",
      },
      {
        heading: "About the role",
        body: "As a Data Scientist at Aetherfield, you'll help shape the analytical engine behind our platform. You'll collaborate with product and engineering teams to design models that interpret environmental impact, forecast future trends, and uncover actionable insights for our customers. Your work will directly influence how companies plan, report, and act on their sustainability strategies.",
      },
      {
        heading: "Requirements",
        items: [
          "3+ years of experience in data science or applied analytics (Python, SQL, etc.)",
          "Experience working with climate, sustainability, or supply chain datasets is a plus",
          "Strong foundation in statistics and data modeling",
          "Ability to communicate complex insights clearly to both technical and non-technical teams",
          "Curiosity, clarity, and care in how you approach messy data",
          "Passion for solving real-world problems with purpose and precision",
        ],
      },
      {
        heading: "Company benefits",
        items: [
          "Competitive salary and equity options",
          "Flexible, hybrid work environment",
          "Generous PTO and paid volunteer days",
          "Annual sustainability stipend",
          "Team offsites and climate-focused retreats",
          "A mission-first culture that values clarity, impact, and integrity",
        ],
      },
    ],
    cta: "Ready to help build the future of climate intelligence?",
  },
  // Transcribed from `public/assets/pages/13-job-listing3/screen-sizes/Desktop.png`.
  // Company description and Company benefits are byte-identical to the Data
  // Scientist entry — the comp repeats them, so keep the two in step.
  "product-manager": {
    sections: [
      {
        heading: "Company description",
        body: "At Aetherfield, we build software that empowers companies to lead with climate accountability. Our platform helps sustainability and operations teams make sense of complex environmental data—transforming emissions, waste, and energy metrics into measurable, meaningful action. We're a mission-driven team of technologists, designers, and scientists working to accelerate the shift toward a low-carbon future.",
      },
      {
        heading: "About the role",
        body: "As a Product Manager at Aetherfield, you'll define and drive the roadmap for climate intelligence tools used by leading sustainability teams. You'll work closely with engineering, design, and customers to turn complex workflows into intuitive, impactful solutions. From shaping product strategy to refining launch details, your work will guide how enterprises operationalize their climate goals.",
      },
      {
        heading: "Requirements",
        items: [
          "5+ years of experience in product management for SaaS or data platforms",
          "Strong customer instincts with a track record of shipping thoughtful, user-centered products",
          "Ability to translate complex problems into clear product requirements",
          "Familiarity with sustainability, climate tech, or enterprise reporting systems is a plus",
          "Excellent collaboration and communication skills",
          "Drive to work on mission-aligned technology that moves the needle",
        ],
      },
      {
        heading: "Company benefits",
        items: [
          "Competitive salary and equity options",
          "Flexible, hybrid work environment",
          "Generous PTO and paid volunteer days",
          "Annual sustainability stipend",
          "Team offsites and climate-focused retreats",
          "A mission-first culture that values clarity, impact, and integrity",
        ],
      },
    ],
    cta: "Ready to help build the future of climate intelligence?",
  },
};

/** Only slugs with prose are routed; UX Designer 404s by design until
    `12-job-listing2` is built. Same rule `WRITTEN_SLUGS` applies to the
    journal. */
export const WRITTEN_JOB_SLUGS = Object.keys(JOB_BODIES);

export function getJob(slug: string) {
  return JOBS.find((job) => job.slug === slug);
}
