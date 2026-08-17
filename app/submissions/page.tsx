import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SiteFooter, SiteNav } from "../_components/chrome";
import { ApplicationList } from "../_components/submissions/application-list";
import { LeadList } from "../_components/submissions/lead-list";
import { Pagination } from "../_components/submissions/pagination";
import { StaffList } from "../_components/submissions/staff-list";
import { SubscriberList } from "../_components/submissions/subscriber-list";
import {
  requestedCallback,
  VIEW_LABELS,
  viewHref,
  type RawSearchParams,
} from "../_components/submissions/views";
import { requireSubmissionsAccount } from "../../lib/auth/server";
import {
  countApplications,
  listApplications,
} from "../../lib/db/application-queries";
import {
  countVerifiedAccounts,
  listVerifiedAccounts,
} from "../../lib/db/auth-queries";
import {
  countLeads,
  listLeads,
  SUBMISSIONS_PAGE_SIZE,
} from "../../lib/db/lead-queries";
import {
  countSubscribers,
  listSubscribers,
} from "../../lib/db/subscriber-queries";
import {
  parseSubmissionPage,
  parseSubmissionView,
  type SubmissionView,
} from "../../lib/validation/submissions";

/**
 * The submissions workspace — build step 7's authenticated read.
 *
 * **The composition root.** Prompt 120 moved the four entity lists, the shared
 * record idiom, the pager and the view vocabulary into
 * `app/_components/submissions/`; what stays here is the authorisation, the
 * query parsing, the reads and the layout that arranges them. No query moved
 * with the JSX (AGENTS.md 6.2), and no client boundary was added.
 *
 * **Authorisation is the first thing this page does**, above everything it
 * renders: `requireSubmissionsAccount` resolves the staff role from Postgres per
 * request, and the `staff` view is narrowed to `leads` for a non-admin before
 * any account row is read. `proxy.ts` is optimistic and is never the enforcement
 * (AGENTS.md 11.2 rule 1).
 */

export const metadata: Metadata = {
  title: "Submissions — Aetherfield",
  description: "Aetherfield's protected operational submissions workspace.",
};

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = await searchParams;
  const account = await requireSubmissionsAccount(requestedCallback(query));
  const parsedView = parseSubmissionView(query.view);
  const view =
    parsedView === "staff" && account.role !== "admin" ? "leads" : parsedView;
  const page = parseSubmissionPage(query.page);

  let total: number;
  let content: ReactNode;
  if (view === "leads") {
    const [rows, count] = await Promise.all([listLeads(page), countLeads()]);
    total = count;
    content = <LeadList rows={rows} admin={account.role === "admin"} />;
  } else if (view === "subscribers") {
    const [rows, count] = await Promise.all([
      listSubscribers(page),
      countSubscribers(),
    ]);
    total = count;
    content = <SubscriberList rows={rows} admin={account.role === "admin"} />;
  } else if (view === "applications") {
    const [rows, count] = await Promise.all([
      listApplications(page),
      countApplications(),
    ]);
    total = count;
    content = <ApplicationList rows={rows} admin={account.role === "admin"} />;
  } else {
    const [rows, count] = await Promise.all([
      listVerifiedAccounts(page),
      countVerifiedAccounts(),
    ]);
    total = count;
    content = <StaffList rows={rows} actingAdminId={account.user.id} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE));
  if (page > totalPages) redirect(viewHref(view, totalPages));

  const views: SubmissionView[] =
    account.role === "admin"
      ? ["leads", "subscribers", "applications", "staff"]
      : ["leads", "subscribers", "applications"];

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <p className="font-mono text-caption text-muted">OPERATIONS</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Submissions, clearly in view.
        </h1>
        <p className="mt-7 max-w-[700px] font-serif text-p2 text-muted">
          Review live demo requests, newsletter lifecycles and job applications.
          Access is checked against the current staff role on every request.
        </p>

        <nav aria-label="Submission views" className="mt-12 flex flex-wrap gap-x-7 gap-y-3 border-b border-border pb-4">
          {views.map((item) => (
            <Link
              key={item}
              href={viewHref(item)}
              aria-current={view === item ? "page" : undefined}
              className={`font-sans text-nav font-bold underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                view === item ? "text-ink underline" : "text-muted hover:text-ink"
              }`}
            >
              {VIEW_LABELS[item]}
            </Link>
          ))}
        </nav>

        <section className="mt-10" aria-labelledby="submissions-view-heading">
          <div className="mb-6 flex items-end justify-between gap-5">
            <h2 id="submissions-view-heading" className="font-sans text-[28px] leading-8 font-bold">
              {VIEW_LABELS[view]}
            </h2>
            <p className="font-mono text-caption text-muted">Newest first</p>
          </div>
          {content}
          <Pagination view={view} page={page} total={total} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
