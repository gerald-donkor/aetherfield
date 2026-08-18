import type { ReactNode } from "react";
import { SiteFooter, SiteNav } from "./chrome";
import { WorkspaceNav } from "./workspace-nav";

export type WorkspaceBoundaryCurrent = "dashboard" | "targets" | "reports";

export function WorkspaceBoundary({
  eyebrow,
  heading,
  headingClassName = "max-w-[880px]",
  current,
  status,
  children,
}: {
  eyebrow: string;
  heading: string;
  headingClassName?: string;
  current?: WorkspaceBoundaryCurrent;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        {current ? <WorkspaceNav current={current} /> : null}
        <p className="font-mono text-caption text-muted">{eyebrow}</p>
        <h1
          className={`mt-6 font-serif text-[48px] leading-[0.98] md:text-[64px] ${headingClassName}`}
        >
          {heading}
        </h1>
        {status ? (
          <div
            className="mt-12 border-y border-border py-14 font-serif text-p2 text-muted"
            role="status"
          >
            {status}
          </div>
        ) : null}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
