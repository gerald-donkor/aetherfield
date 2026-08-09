"use client";

import { SiteFooter, SiteNav } from "../_components/chrome";
import { Button } from "../_components/primitives";

export default function SubmissionsError({ reset }: { reset: () => void }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <p className="font-mono text-caption text-muted">OPERATIONS</p>
        <h1 className="mt-6 max-w-[760px] font-serif text-[48px] leading-[0.98] md:text-[64px]">
          {"This view isn't available just now."}
        </h1>
        <p className="mt-7 max-w-[640px] font-serif text-p2 text-muted">
          No submission details were displayed. Try the request again.
        </p>
        <Button className="mt-10" onClick={reset}>Try again</Button>
      </main>
      <SiteFooter />
    </>
  );
}
