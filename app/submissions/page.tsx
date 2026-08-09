import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SiteFooter, SiteNav } from "../_components/chrome";
import { ButtonLink } from "../_components/primitives";
import { requireSubmissionsAccount } from "../../lib/auth/server";
import {
  countApplications,
  listApplications,
  type ListedApplication,
} from "../../lib/db/application-queries";
import {
  countVerifiedAccounts,
  listVerifiedAccounts,
  type ListedAccount,
} from "../../lib/db/auth-queries";
import {
  countLeads,
  listLeads,
  SUBMISSIONS_PAGE_SIZE,
  type ListedLead,
} from "../../lib/db/lead-queries";
import {
  countSubscribers,
  listSubscribers,
  type ListedSubscriber,
} from "../../lib/db/subscriber-queries";
import {
  parseSubmissionPage,
  parseSubmissionView,
  type SubmissionView,
} from "../../lib/validation/submissions";
import {
  RemoveSubmissionControl,
  StaffRoleControl,
} from "./action-controls";

export const metadata: Metadata = {
  title: "Submissions — Aetherfield",
  description: "Aetherfield's protected operational submissions workspace.",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const VIEW_LABELS: Record<SubmissionView, string> = {
  leads: "Leads",
  subscribers: "Subscribers",
  applications: "Applications",
  staff: "Staff",
};

function requestedCallback(query: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `/submissions?${serialized}` : "/submissions";
}

function viewHref(view: SubmissionView, page = 1): string {
  const params = new URLSearchParams({ view });
  if (page > 1) params.set("page", String(page));
  return `/submissions?${params.toString()}`;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] leading-[16px] text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 wrap-anywhere font-serif text-[16px] leading-6 text-ink">
        {children}
      </dd>
    </div>
  );
}

function RecordCard({ children }: { children: ReactNode }) {
  return (
    <li className="border-b border-border py-6 first:border-t lg:py-5">
      {children}
    </li>
  );
}

function LeadList({ rows, admin }: { rows: ListedLead[]; admin: boolean }) {
  if (rows.length === 0) return <EmptyState label="demo requests" />;
  return (
    <ul aria-label="Demo requests">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.1fr_1.3fr_1fr_0.8fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Contact">
                <span className="font-sans font-bold">{row.name}</span>
                <br />
                {row.email}
              </Detail>
              <Detail label="Company / message">
                <span className="font-sans font-bold">{row.company}</span>
                {row.message ? <><br />{row.message}</> : null}
              </Detail>
              <Detail label="Source">{row.source.replace("_", " ")}</Detail>
              <Detail label="Received">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
            </dl>
            {admin ? (
              <RemoveSubmissionControl kind="lead" id={row.id} label="Lead" />
            ) : null}
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

function SubscriberList({
  rows,
  admin,
}: {
  rows: ListedSubscriber[];
  admin: boolean;
}) {
  if (rows.length === 0) return <EmptyState label="newsletter subscribers" />;
  return (
    <ul aria-label="Newsletter subscribers">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.4fr_0.7fr_1fr_1fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Email">{row.email}</Detail>
              <Detail label="Status">{row.status}</Detail>
              <Detail label="Created">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
              <Detail label="Lifecycle">
                {row.confirmationTokenSentAt ? (
                  <>Confirmation sent {DATE_FORMAT.format(row.confirmationTokenSentAt)} UTC</>
                ) : (
                  <>No confirmation send recorded</>
                )}
                {row.confirmedAt ? (
                  <><br />Confirmed {DATE_FORMAT.format(row.confirmedAt)} UTC</>
                ) : null}
                {row.unsubscribedAt ? (
                  <><br />Unsubscribed {DATE_FORMAT.format(row.unsubscribedAt)} UTC</>
                ) : null}
              </Detail>
            </dl>
            {admin ? (
              <RemoveSubmissionControl
                kind="subscriber"
                id={row.id}
                label="Subscriber"
              />
            ) : null}
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

function ApplicationList({
  rows,
  admin,
}: {
  rows: ListedApplication[];
  admin: boolean;
}) {
  if (rows.length === 0) return <EmptyState label="job applications" />;
  return (
    <ul aria-label="Job applications">
      {rows.map((row) => (
        <RecordCard key={row.id}>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.1fr_1fr_1.2fr_0.8fr_auto] lg:items-start">
            <dl className="contents">
              <Detail label="Applicant">
                <span className="font-sans font-bold">{row.name}</span>
                <br />
                {row.email}
              </Detail>
              <Detail label="Role">{row.jobSlug.replaceAll("-", " ")}</Detail>
              <Detail label="Message">{row.message ?? "No message supplied."}</Detail>
              <Detail label="Received">{DATE_FORMAT.format(row.createdAt)} UTC</Detail>
            </dl>
            <div className="min-w-0">
              <ButtonLink
                href={`/submissions/applications/${row.id}/cv`}
                size="compact"
                bullet={false}
                className="max-w-full wrap-anywhere"
              >
                {row.cvFilename}
              </ButtonLink>
              {admin ? (
                <RemoveSubmissionControl
                  kind="application"
                  id={row.id}
                  label="Application"
                />
              ) : null}
            </div>
          </div>
        </RecordCard>
      ))}
    </ul>
  );
}

function StaffList({
  rows,
  actingAdminId,
}: {
  rows: ListedAccount[];
  actingAdminId: string;
}) {
  if (rows.length === 0) return <EmptyState label="verified accounts" />;
  return (
    <ul aria-label="Verified accounts">
      {rows.map((row) => {
        const roleLabel =
          row.role === "admin"
            ? "Admin"
            : row.role === "staff"
              ? "Staff"
              : row.role === null
                ? "Customer"
                : "Other";
        const controllable =
          row.id !== actingAdminId &&
          (row.role === null || row.role === "staff");
        return (
          <RecordCard key={row.id}>
            <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_1.3fr_0.7fr_0.8fr_auto] lg:items-start">
              <dl className="contents">
                <Detail label="Name">{row.name}</Detail>
                <Detail label="Email">{row.email}</Detail>
                <Detail label="Verified">{row.emailVerified ? "Yes" : "No"}</Detail>
                <Detail label="Role / created">
                  {roleLabel}
                  <br />
                  {DATE_FORMAT.format(row.createdAt)} UTC
                </Detail>
              </dl>
              {controllable ? (
                <StaffRoleControl
                  userId={row.id}
                  displayName={row.name}
                  isStaff={row.role === "staff"}
                />
              ) : null}
            </div>
          </RecordCard>
        );
      })}
    </ul>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="border-y border-border py-14">
      <h2 className="font-sans text-[24px] leading-7 font-bold">Nothing here yet.</h2>
      <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
        No live {label} match this view.
      </p>
    </div>
  );
}

function Pagination({
  view,
  page,
  total,
}: {
  view: SubmissionView;
  page: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE));
  return (
    <nav
      aria-label={`${VIEW_LABELS[view]} pagination`}
      className="mt-8 flex items-center justify-between gap-5"
    >
      {page > 1 ? (
        <Link
          href={viewHref(view, page - 1)}
          className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Previous
        </Link>
      ) : <span />}
      <p className="font-mono text-caption text-muted">
        Page {page} of {totalPages} · {total} total
      </p>
      {page < totalPages ? (
        <Link
          href={viewHref(view, page + 1)}
          className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}

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
