import Image from "next/image";
import Link from "next/link";
import { FEATURED_ARTICLES } from "../../_content/articles";
import { Reveal } from "../motion/reveal";
import { Button, Meta } from "../primitives";
import { Container } from "./container";
import { JournalMark } from "./journal-mark";

export function Journal() {
  return (
    <Reveal as="section" stagger className="pb-20 md:pb-28">
      <Container>
        <div className="md:grid md:grid-cols-[190px_1fr] md:items-start md:gap-8 lg:grid-cols-[1fr_2fr] lg:gap-10">
          {/* Not a `data-reveal-item`: the mark has its own flip, in its own
              client leaf, and must not also claim a slot in this section's
              stagger. See AGENTS.md, "The journal mark's flip". */}
          <JournalMark />

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
                  {/* The slide sits on the Link, not the li: the li carries the
                      row's rule (which the reference holds still) and GSAP's
                      inline reveal transform. Measured off the reference —
                      10px, ~300ms, ease-in-out. See AGENTS.md. */}
                  <Link
                    href={`/article/${a.slug}`}
                    className="group grid gap-4 transition-transform duration-300 ease-in-out hover:translate-x-2.5 motion-reduce:transition-none md:grid-cols-[164px_1fr] md:items-start md:gap-6"
                  >
                    {/* The zoom needs something to clip against, so the image
                        gets a wrapper of its own. Tailwind v4 emits `scale-110`
                        as the independent `scale` property — the mechanic
                        already recorded for `translate-x-2.5` — so the
                        transition list names `scale`, not `transform`. The
                        300ms ease-in-out is the curve measured for these rows;
                        it is reused, not refitted. */}
                    <span className="block overflow-hidden">
                      {/* src is optional on Article for the styleguide's inert
                          specimens; every real entry carries one. */}
                      <Image
                        src={a.src!}
                        alt=""
                        width={328}
                        height={200}
                        sizes="(max-width: 768px) 100vw, 164px"
                        className="aspect-[164/100] w-full object-cover transition-[scale,filter] duration-300 ease-in-out group-hover:scale-110 group-hover:grayscale motion-reduce:transition-none"
                      />
                    </span>
                    <div>
                      {/* The reference draws no underline — the title just
                          fades. 0.7 is the footer's existing idiom and sits
                          inside the measurement; text-muted is ruled out. */}
                      <h3 className="font-sans text-p1 font-bold transition-opacity duration-300 ease-in-out group-hover:opacity-70 motion-reduce:transition-none">
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
