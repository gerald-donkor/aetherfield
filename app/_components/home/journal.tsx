import Image from "next/image";
import Link from "next/link";
import { FEATURED_ARTICLES } from "../../_content/articles";
import { Reveal } from "../motion/reveal";
import { Button, Meta } from "../primitives";
import { Container } from "./container";

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
    <Reveal as="section" stagger className="pb-20 md:pb-28">
      <Container>
        <div className="md:grid md:grid-cols-[190px_1fr] md:items-start md:gap-8 lg:grid-cols-[1fr_2fr] lg:gap-10">
          {/* Tilted as drawn in the comps. On tablet it hangs off the left
              gutter; on mobile it is dropped, where it would crowd the list. */}
          <div
            className="hidden md:-mt-4 md:-ml-24 md:block md:w-[290px] md:-rotate-[8deg] lg:mt-0 lg:ml-0 lg:w-auto"
            data-reveal-item
          >
            <JournalMark />
          </div>

          <div>
            <h2
              className="display-fluid-h4 text-center font-sans font-bold md:text-left"
              data-reveal-item
            >
              From the journal
            </h2>
            <ul className="mt-6 border-t border-border">
              {FEATURED_ARTICLES.map((a) => (
                <li
                  key={a.slug}
                  className="border-b border-border py-5"
                  data-reveal-item
                >
                  <Link
                    href={`/article/${a.slug}`}
                    className="group grid gap-4 md:grid-cols-[164px_1fr] md:items-start md:gap-6"
                  >
                    {/* src is optional on Article for the styleguide's inert
                        specimens; every real entry carries one. */}
                    <Image
                      src={a.src!}
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
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-center">
              <Button
                size="secondary"
                bullet={false}
                className="w-full sm:w-auto"
                data-reveal-item
              >
                View all articles
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Reveal>
  );
}
