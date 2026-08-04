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
  /** Standfirst, set larger and above the rule. An array is one lede in
      several paragraphs, not several ledes — article 5 is the only one so far. */
  lede: string | string[];
  sections: { heading: string; body: string }[];
  /** Hero photograph for the reading page. */
  hero: { src: string; alt: string };
};

/* Only written articles appear here. generateStaticParams prerenders exactly
   these slugs; everything else in ARTICLES 404s until its prose is written. */
export const ARTICLE_BODIES: Record<string, ArticleBody> = {
  "how-to-build-a-climate-ready-data-stack": {
    published: "May 7, 2026",
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
  "sustainability-isnt-a-side-project-making-impact-operational": {
    published: "May 31, 2026",
    author: "Gail Force",
    lede: "Too often, sustainability lives on the edge of the org chart—under-resourced, reactive, and disconnected from the core business. But real impact isn't an initiative, it's an operating principle. From product decisions to procurement flows, we'll explore what it takes to embed sustainability into the systems that shape everyday work.",
    hero: {
      src: "/assets/generated/article-impact-hero.png",
      alt: "Ferns and moss on a shaded rock face, rendered as a blue halftone over cream",
    },
    sections: [
      {
        heading: "The Risk of Isolation",
        body: "When sustainability is framed as a special project, it stays optional. It doesn't scale, and it rarely survives resource cuts. Real impact demands more than executive sponsorship or a glossy strategy deck—it requires integration into the systems that run the business.",
      },
      {
        heading: "Connect to Core Workflows",
        body: "The most successful sustainability programs live inside decision-making, not adjacent to it. That means embedding carbon data in procurement reviews, emissions factors in product roadmaps, and impact metrics in business KPIs. Alignment isn't just helpful—it's how things get done.",
      },
      {
        heading: "Mind the Gaps",
        body: "Even teams with good intentions can fall into operational gaps. Sustainability may be owned by one team, but its success hinges on others—like finance, legal, ops, and product—adopting the same standards and workflows. Clear roles, shared tooling, and open feedback loops close the gap between ambition and execution.",
      },
      {
        heading: "Systems Over Sprints",
        body: "Impact doesn't come from one-off campaigns. It comes from systems that make the right choice the easy choice—again and again. Whether through automation, governance, or smart defaults, sustainability needs to show up where decisions are made, not just where reports are written.",
      },
      {
        heading: "Make It Stick",
        body: "Operationalizing sustainability means designing for durability. It means building programs that don't require daily heroics to sustain and that evolve with the business over time. When impact becomes part of how work works, momentum follows.",
      },
    ],
  },
  "inside-the-aetherfield-model-how-we-turn-data-into-action": {
    published: "June 16, 2026",
    author: "Theo Retical",
    lede: "Data is everywhere, but turning it into meaningful climate action takes more than dashboards. The Aetherfield Model is our response to the noise—a systems-based approach that connects data, decision-making, and delivery. In this piece, we break down how the model works, and why clarity beats complexity every time.",
    hero: {
      src: "/assets/generated/article-model-hero.png",
      alt: "A person silhouetted against wind turbines at dusk, rendered as a blue halftone over cream",
    },
    sections: [
      {
        heading: "From Signal to Strategy",
        body: "Sustainability teams are overwhelmed with inputs—from sensor data to survey results to supplier estimates. The Aetherfield Model starts with organizing that noise into coherent signals, aligning teams around a shared understanding of what's true, what matters, and where change is possible.",
      },
      {
        heading: "Build for Real-Time Alignment",
        body: "Static reports quickly go stale. Instead, the model favors a living system of metrics, alerts, and dashboards that support decision-making in real time. That means connecting teams not just to the data—but to each other. Context travels faster when systems are designed to carry it.",
      },
      {
        heading: "Centered on Causality",
        body: "Most models focus on correlation. We focus on causality. Aetherfield maps emissions to decisions—showing not just what happened, but why. Whether it's a procurement policy driving Scope 3 emissions or a delivery route inflating Scope 1, the model surfaces cause, not just consequence.",
      },
      {
        heading: "Designed to Evolve",
        body: "Climate strategy isn't static, and neither is the Aetherfield Model. As standards evolve and business conditions shift, the model updates to reflect new realities. This keeps teams responsive and grounded, without having to rebuild from scratch every quarter.",
      },
      {
        heading: "From Model to Momentum",
        body: "The value of a model isn't in its elegance—it's in what it unlocks. With Aetherfield, teams don't just analyze—they act. When data, decisions, and direction are tightly aligned, momentum becomes measurable.",
      },
    ],
  },
  "from-spreadsheets-to-systems-the-evolution-of-climate-reporting": {
    published: "July 1, 2026",
    author: "Dash Bordman",
    lede: "The first wave of climate reporting was built in spreadsheets—manual, patchy, and often siloed. But as expectations rise, so does the need for rigor, scale, and repeatability. We're tracing the journey from reactive carbon tracking to integrated, audit-ready systems that support real-time insight and strategic decisions.",
    hero: {
      src: "/assets/generated/article-reporting-hero.png",
      alt: "Swirling currents seen from the air, rendered as a blue halftone",
    },
    sections: [
      {
        heading: "Born in Excel",
        body: "In the early days, climate reporting was an exercise in scrappiness. Teams pulled together fragmented data from across the business, stitched it into spreadsheets, and hoped it would hold up under scrutiny. But what worked at pilot scale doesn't scale.",
      },
      {
        heading: "The Trust Gap",
        body: "As reporting grew more important—to investors, regulators, and customers—the cracks began to show. Manual processes introduced errors. Inconsistent methods made year-over-year comparisons unreliable. Spreadsheets weren't just inefficient—they undermined trust.",
      },
      {
        heading: "Enter the Platform Era",
        body: "Modern sustainability teams are shifting to purpose-built platforms. These systems automate data ingestion, standardize calculations, and offer controls for audit-readiness. More importantly, they allow teams to focus on interpretation and strategy—not just reconciliation.",
      },
      {
        heading: "Build Once, Report Often",
        body: "The evolution isn't just about tools—it's about process. Strong reporting systems create reusable infrastructure: central data sources, shared assumptions, and templated disclosures. That infrastructure makes reporting faster, easier, and more resilient.",
      },
      {
        heading: "From Reporting to Readiness",
        body: "When reporting is treated as an outcome, it's a burden. When treated as infrastructure, it becomes an advantage. Organizations with robust systems can respond to new standards, evolving regulations, and stakeholder questions with confidence—not scramble.",
      },
    ],
  },
  "carbon-accounting-myths-models-and-must-haves": {
    published: "July 11, 2026",
    author: "Al Gorithm",
    lede: [
      `Carbon accounting is no longer a "nice-to-have" for mission-driven organizations—it's a strategic necessity. But while awareness has grown, clarity hasn't always followed. Between evolving standards, patchy data, and inconsistent terminology, many teams are still unsure where to begin, what's required, or how to do it well.`,
      "Let's clear the fog.",
    ],
    hero: {
      src: "/assets/generated/article-carbon-hero.png",
      alt: "A steep peak above a still mountain lake, rendered as a blue halftone over cream",
    },
    sections: [
      {
        heading: "The Confusion Behind the Numbers",
        body: "Carbon accounting has quickly become a cornerstone of climate strategy—but it's also one of the most misunderstood. As organizations race to report emissions, misconceptions often lead to missteps. From overestimating data requirements to underestimating system design, many teams are navigating without a clear map. Without demystifying the process, even well-intentioned efforts can stall or steer in the wrong direction.",
      },
      {
        /* Straight apostrophes in the headings and curly ones in the prose is
           what the comp draws — see AGENTS.md. */
        heading: "It's Not Just About the Math",
        body: "One persistent myth is that carbon accounting is purely a technical task. In reality, it's a cross-functional process that requires collaboration across finance, operations, procurement, and product teams. Technical accuracy matters, but organizational alignment is what makes carbon data useful—not just reportable. Treating it as a shared responsibility sets the foundation for action—not just analysis.",
      },
      {
        heading: "There's No Universal Template",
        body: "Another common trap is the belief that a one-size-fits-all model exists. Effective carbon accounting needs to reflect your business model, industry, and maturity level. Whether you're estimating Scope 3 emissions or integrating real-time data from suppliers, the right approach balances ambition with feasibility. Customization isn't a compromise—it's a prerequisite for relevance.",
      },
      {
        heading: "Build a Framework That Scales",
        body: "To navigate the complexity, every team needs a framework. That includes a shared vocabulary, clear boundaries between scopes, and an agreed-upon method for prioritizing data sources. A strong model helps teams scale their efforts while maintaining credibility and auditability. Consistency across teams and time zones makes scaling possible without sacrificing integrity.",
      },
      {
        heading: "Turn Data Into Decisions",
        body: "Ultimately, carbon accounting is not just about reporting past impact—it's about informing future decisions. With the right mindset and foundation, organizations can turn their carbon data into a strategic asset, enabling smarter trade-offs, stronger compliance, and more meaningful progress. When embedded into business rhythms, carbon data becomes not just a metric, but a driver of momentum.",
      },
    ],
  },
  "seeing-clearly-designing-feedback-loops-for-sustainable-growth": {
    published: "August 4, 2026",
    author: "Greta Watt",
    lede: "Climate strategy isn't static—it's dynamic, iterative, and shaped by feedback. Yet many sustainability teams operate without the tools to observe, learn, and adapt in real time. To grow sustainably, organizations need loops, not lines. Let's explore how reflection systems can unlock smarter, faster, more resilient progress.",
    hero: {
      src: "/assets/generated/article-loops-hero.png",
      alt: "Braided glacial meltwater channels seen from the air, rendered as a blue halftone",
    },
    sections: [
      {
        heading: "The Loop Advantage",
        body: "Progress doesn't come from acting once—it comes from learning continuously. Feedback loops create a rhythm of observe, reflect, adjust. Without them, climate programs risk drifting off course or missing opportunities to scale what's working.",
      },
      {
        heading: "Make Reflection Measurable",
        body: "You can't improve what you can't observe. Effective loops start with instrumentation—defining clear metrics, setting thresholds, and creating space to interpret results. Loops thrive when reflection is structured, not just anecdotal.",
      },
      {
        heading: "Close the Gap Between Action and Insight",
        body: "Too often, insights arrive long after decisions are made. By embedding sensors, alerts, and review rituals directly into business systems, organizations can respond in real time—not retroactively. The faster the loop, the faster the progress.",
      },
      {
        heading: "Design for Participation",
        body: "Feedback loops aren't just for analysts—they're for everyone. Create pathways for frontline employees, customers, and partners to contribute insights. When everyone has a seat at the table, blind spots shrink and ownership grows.",
      },
      {
        heading: "Momentum Through Awareness",
        body: "Clarity fuels motivation. When teams can see the impact of their work—and where they can improve—they engage more deeply. Feedback loops don't just optimize outcomes—they build a culture of continuous progress.",
      },
    ],
  },
};

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

/** Slugs with prose behind them — the set the article route prerenders. */
export const WRITTEN_SLUGS = Object.keys(ARTICLE_BODIES);
