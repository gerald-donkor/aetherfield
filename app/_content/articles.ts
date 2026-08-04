/* -------------------------------------------------------------------------- */
/*  Articles — the single list behind /, /journal and /article/[slug]           */
/*                                                                              */
/*  Cards only ever need the summary fields, so the prose lives in a separate    */
/*  map keyed by slug. That keeps the three index pages from pulling article     */
/*  bodies into their payloads, and makes "which articles are written?" a        */
/*  one-line question — see ARTICLE_BODIES / getArticleBody below.               */
/* -------------------------------------------------------------------------- */

export type Article = {
  slug: string;
  title: string;
  category: string;
  readTime: string;
  description?: string;
  /** Editorial photograph. Falls back to the grey Placeholder when absent. */
  src?: string;
  alt?: string;
};

export const ARTICLES: Article[] = [
  {
    slug: "how-to-build-a-climate-ready-data-stack",
    title: "How to Build a Climate-Ready Data Stack",
    category: "Insights",
    readTime: "4 min",
    description:
      "A practical guide for sustainability teams on integrating emissions, waste, and energy data into modern workflows.",
    src: "/assets/images/Image-3.png",
    alt: "Sheer white fabric lifting against an open blue sky",
  },
  {
    slug: "sustainability-isnt-a-side-project-making-impact-operational",
    title: "Sustainability Isn't a Side Project: Making Impact Operational",
    category: "Strategy",
    readTime: "7 min",
    description:
      "Why climate goals belong in your core roadmap—not just in the annual ESG report.",
    src: "/assets/images/Image-7.png",
    alt: "Ferns and moss growing along a shaded rock face",
  },
  {
    slug: "inside-the-aetherfield-model-how-we-turn-data-into-action",
    title: "Inside the Aetherfield Model: How We Turn Data Into Action",
    category: "Insights",
    readTime: "5 min",
    description:
      "A behind-the-scenes look at our platform logic, system architecture, and sustainability reasoning.",
    src: "/assets/images/Image-6.png",
    alt: "A person silhouetted against wind turbines at dusk",
  },
  {
    slug: "from-spreadsheets-to-systems-the-evolution-of-climate-reporting",
    title: "From Spreadsheets to Systems: The Evolution of Climate Reporting",
    category: "Tooling",
    readTime: "6 min",
    description:
      "Why legacy tools aren't enough—and what the next generation of reporting looks like.",
    src: "/assets/images/Image-4.png",
    alt: "Braided glacial meltwater channels seen from the air",
  },
  {
    slug: "carbon-accounting-myths-models-and-must-haves",
    title: "Carbon Accounting: Myths, Models, and Must-Haves",
    category: "Tooling",
    readTime: "6 min",
    description:
      "Debunking common assumptions and offering a framework for getting it right.",
    src: "/assets/images/Image-5.png",
    alt: "A steep peak rising above a still mountain lake",
  },
  {
    slug: "seeing-clearly-designing-feedback-loops-for-sustainable-growth",
    title: "Seeing Clearly: Designing Feedback Loops for Sustainable Growth",
    category: "Strategy",
    readTime: "4 min",
    description:
      "Building responsive systems that keep sustainability strategy adaptive and actionable.",
    src: "/assets/images/Image-9.png",
    alt: "A hand holding a mirrored panel above a green rice field",
  },
];

/** The three the homepage has always shown. */
export const FEATURED_ARTICLES = ARTICLES.slice(0, 3);

export type ArticleBody = {
  published: string;
  author: string;
  /** Standfirst, set larger and above the rule. */
  lede: string;
  sections: { heading: string; body: string }[];
  /** Hero photograph for the reading page. */
  hero: { src: string; alt: string };
};

/* Only written articles appear here. generateStaticParams prerenders exactly
   these slugs; everything else in ARTICLES 404s until its prose is written. */
export const ARTICLE_BODIES: Record<string, ArticleBody> = {
  "how-to-build-a-climate-ready-data-stack": {
    published: "May 7, 2028",
    author: "Lana Terra",
    lede: "Climate action is only as strong as the data that informs it. But most data stacks weren't designed with emissions, supply chains, or climate modeling in mind. Teams are often stuck retrofitting existing systems or relying on brittle workarounds to generate insights. It's time to rethink our infrastructure—starting with the foundation.",
    hero: {
      src: "/assets/generated/article-climate-hero.png",
      alt: "A person reading from a laptop, rendered as a blue halftone over cream",
    },
    sections: [
      {
        heading: "Built for Another Era",
        body: "Most data infrastructures were built to optimize for sales, user growth, or cost—not carbon. This creates friction when sustainability teams try to source emissions data from systems that weren't designed to capture it. Without foundational visibility, even basic reporting becomes a manual, error-prone task. The result? Delays, duplications, and disconnects.",
      },
      {
        heading: "Bridging the Gaps",
        body: "Emissions data lives everywhere—and nowhere. From procurement software to building sensors, critical signals are often siloed across vendors, formats, or departments. The first step to a climate-ready stack is connection: mapping where relevant data lives, how it's structured, and where the friction points are in accessing it consistently.",
      },
      {
        heading: "Stack With Strategy",
        body: "A modern climate stack isn't just a bundle of tools—it's an integrated system that mirrors how your business actually operates. This means prioritizing interoperability, aligning metrics across platforms, and investing in foundational data governance. Tools alone won't solve emissions blind spots—strategy will.",
      },
      {
        heading: "Bake in Flexibility",
        body: "Regulatory frameworks, emissions factors, and supplier data are constantly evolving. Your data stack should too. That means designing for modularity, version control, and extensibility. Future-proofing your system is less about predicting what's next and more about building with change in mind.",
      },
      {
        heading: "From Stack to Story",
        body: "At the end of the day, data infrastructure is only valuable if it drives action. A climate-ready stack enables teams to monitor progress, identify trade-offs, and make informed decisions at speed. With the right foundations in place, sustainability becomes more than a report—it becomes a capability.",
      },
    ],
  },
};

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** Slugs with prose behind them — the set the article route prerenders. */
export const WRITTEN_SLUGS = Object.keys(ARTICLE_BODIES);
