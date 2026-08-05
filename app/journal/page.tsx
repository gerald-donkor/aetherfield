import type { Metadata } from "next";
import { CtaBand, SiteFooter, SiteNav } from "../_components/chrome";
import { Container } from "../_components/home/container";
import { JournalStamp, LatestArticles } from "../_components/journal/sections";

export const metadata: Metadata = {
  title: "Journal — Aetherfield",
  description:
    "Field notes on climate data, sustainability strategy, and the tools that turn measurement into action.",
};

export default function Page() {
  return (
    <>
      {/* SiteNav carries its own gutters and is sticky: it must not sit inside
          a one-child wrapper, or it unpins as soon as that wrapper scrolls off. */}
      <SiteNav />

      <main>
        {/* The stamp butts straight up against the 60px nav — no top margin. */}
        <Container>
          <JournalStamp />
          <LatestArticles />
        </Container>
        <CtaBand
          headline="Subscribe to Aetherfield Journal"
          action="Sign up to newsletter"
        />
      </main>

      <SiteFooter />
    </>
  );
}
