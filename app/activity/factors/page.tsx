import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CustomFactorForm } from "../../_components/activity/custom-factor-form";
import { SiteFooter, SiteNav } from "../../_components/chrome";
import { WorkspaceNav } from "../../_components/workspace-nav";
import { requireOrganization } from "../../../lib/auth/organization";
import {
  listTenantFactorSets,
  listTenantFactors,
} from "../../../lib/db/emission-queries";

export const metadata: Metadata = {
  title: "Customer factors — Aetherfield",
  description: "Add customer-supplied emission factors for your organisation.",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function ActivityFactorsPage() {
  const membership = await requireOrganization("/activity/factors");
  const [sets, factors] = await Promise.all([
    listTenantFactorSets(membership.organization.id),
    listTenantFactors(membership.organization.id),
  ]);

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="activity" />
        <p className="font-mono text-caption text-muted">CUSTOMER FACTORS</p>
        <h1 className="mt-6 max-w-[900px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Add tenant-owned factors with provenance attached.
        </h1>
        <p className="mt-7 max-w-[760px] font-serif text-p2 text-muted">
          {membership.organization.name} has{" "}
          {sets.length.toLocaleString("en-GB")} customer-supplied factor{" "}
          {sets.length === 1 ? "set" : "sets"} and{" "}
          {factors.length.toLocaleString("en-GB")} factor{" "}
          {factors.length === 1 ? "row" : "rows"}. New rows become available
          in factor mapping after they are saved.
        </p>
        <p className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/activity/mappings"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Use factors in mapping
          </Link>
          <Link
            href="/activity"
            className="font-sans text-nav font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to activity
          </Link>
        </p>

        <section className="mt-16" aria-labelledby="custom-factor-sets-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <h2
              id="custom-factor-sets-heading"
              className="font-sans text-[28px] leading-8 font-bold"
            >
              Factor sets
            </h2>
            <p className="font-mono text-caption text-muted">Newest first</p>
          </div>

          {sets.length === 0 ? (
            <div className="border-y border-border py-14">
              <h3 className="font-sans text-[24px] leading-7 font-bold">
                No customer-supplied sets yet.
              </h3>
              <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
                Save a factor below. Its source and version will create the set
                it belongs to.
              </p>
            </div>
          ) : (
            <ul aria-label="Customer-supplied factor sets">
              {sets.map((set) => (
                <li key={set.id} className="border-b border-border py-5 first:border-t">
                  <div className="grid gap-5 lg:grid-cols-[1.1fr_0.8fr_1fr_0.6fr]">
                    <Detail label="Source">
                      <span className="font-sans font-bold">{set.source}</span>
                      <br />
                      {set.datasetVersion}
                    </Detail>
                    <Detail label="Effective">
                      {set.effectiveFrom} to {set.effectiveTo}
                      <br />
                      Published {set.publicationYear}
                    </Detail>
                    <Detail label="Provenance">
                      {set.licence}
                      {set.licenceUrl ? (
                        <>
                          <br />
                          <a
                            href={set.licenceUrl}
                            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            Licence
                          </a>
                        </>
                      ) : null}
                      {set.sourceUrl ? (
                        <>
                          <br />
                          <a
                            href={set.sourceUrl}
                            className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            Source
                          </a>
                        </>
                      ) : set.sourceReference ? (
                        <>
                          <br />
                          {set.sourceReference}
                        </>
                      ) : null}
                    </Detail>
                    <Detail label="Rows">
                      {set.factorCount.toLocaleString("en-GB")}
                      <br />
                      Added {DATE_FORMAT.format(set.createdAt)} UTC
                    </Detail>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-20" aria-labelledby="custom-factor-create-heading">
          <h2
            id="custom-factor-create-heading"
            className="font-sans text-[28px] leading-8 font-bold"
          >
            Add a factor
          </h2>
          <p className="mt-4 max-w-[720px] font-serif text-p2 text-muted">
            The value is stored as kgCO2e per activity unit. Creating a row does
            not map it to existing activity data; use factor mapping after
            saving.
          </p>
          <div className="mt-10 border-y border-border py-8">
            <CustomFactorForm factors={factors} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
