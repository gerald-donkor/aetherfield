import Link from "next/link";
import type { ReactNode } from "react";

import { SiteFooter, SiteNav } from "../chrome";
import { Wordmark } from "../primitives";

export function AuthShell({
  eyebrow,
  title,
  introduction,
  alternateLabel,
  alternateAction,
  alternateHref,
  children,
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  alternateLabel: string;
  alternateAction: string;
  alternateHref: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        aria-hidden
        className="hero-sky absolute inset-x-0 top-0 -z-10 h-[420px] md:h-[520px]"
      />
      <SiteNav />
      <main className="mx-auto grid min-h-[720px] w-full max-w-page gap-12 px-5 py-16 md:grid-cols-2 md:items-start md:gap-16 md:py-24 lg:px-6 lg:py-28">
        <section className="max-w-[520px]">
          <p className="font-mono text-caption text-muted">{eyebrow}</p>
          <h1 className="mt-6 font-serif text-[48px] leading-[0.98] md:text-[64px]">
            {title}
          </h1>
          <p className="mt-7 max-w-[480px] font-serif text-p2 text-muted">
            {introduction}
          </p>
          <div className="mt-12 border-t border-border pt-6">
            <Wordmark className="text-[22px]" />
            <p className="mt-3 font-mono text-[12px] leading-[18px] text-muted">
              Track. Model. Report. Act.
            </p>
          </div>
        </section>

        <section className="bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)] md:p-10">
          {children}
          <p className="mt-8 border-t border-border pt-6 font-serif text-[16px] text-muted">
            {alternateLabel}{" "}
            <Link
              href={alternateHref}
              className="font-sans font-bold text-ink underline decoration-border underline-offset-4 hover:decoration-ink"
            >
              {alternateAction}
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
