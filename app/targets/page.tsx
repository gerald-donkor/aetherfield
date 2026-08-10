import type { Metadata } from "next";

import { CreateTargetForm } from "../_components/targets/create-target-form";
import { TargetCard } from "../_components/targets/target-card";
import { SiteFooter, SiteNav } from "../_components/chrome";
import { WorkspaceNav } from "../_components/workspace-nav";
import { requireOrganization } from "../../lib/auth/organization";
import {
  listTargets,
  readTargetEvidence,
} from "../../lib/db/target-queries";
import { ZERO, compare, rescale, toFixed } from "../../lib/domain/decimal";
import { totalsForCoverage } from "../../lib/domain/targets";
import { TARGET_COVERAGES } from "../../lib/validation/targets";

export const metadata: Metadata = {
  title: "Targets — Aetherfield",
  description: "Set emissions targets and read their trajectory and projection.",
};

export default async function TargetsPage() {
  const membership = await requireOrganization("/targets");
  const [targets, evidence] = await Promise.all([
    listTargets(membership.organization.id),
    readTargetEvidence(membership.organization.id),
  ]);
  const asOf = new Date().toISOString().slice(0, 10);
  const suggestions = evidence.uncalculatedRecords === 0
    ? evidence.yearly.flatMap((period) =>
        TARGET_COVERAGES.flatMap((coverage) => {
      const kg = totalsForCoverage(period.totals, coverage);
      if (compare(kg, ZERO) <= 0) return [];
      /* The form admits thousandths of a tonne, so a computed suggestion is
         rounded once to the nearest kilogram before it crosses to the client. */
      const tonnes = { units: rescale(kg, 0, "half-even").units, scale: 3 };
      return [{ year: Number(period.period), coverage, tonnes: toFixed(tonnes, 3, "half-even") }];
        }),
      )
    : [];

  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[720px] w-full max-w-page px-5 py-16 md:py-24 lg:px-6">
        <WorkspaceNav current="targets" />
        <p className="font-mono text-caption text-muted">TARGETS</p>
        <h1 className="mt-6 max-w-[880px] font-serif text-[48px] leading-[0.98] text-balance md:text-[64px]">
          Put the commitment beside the evidence.
        </h1>
        <p className="mt-7 max-w-[720px] font-serif text-p2 text-muted">
          Set an absolute emissions target, keep the filed baseline fixed, and
          read the planned trajectory against the observed run rate. Projections
          are labelled projections; gaps in calculated activity stay visible.
        </p>
        <section className="mt-16" aria-labelledby="create-target-heading">
          <h2 id="create-target-heading" className="font-sans text-[28px] leading-8 font-bold">
            Set a target
          </h2>
          <p className="mt-4 max-w-[700px] font-serif text-p2 text-muted">
            The baseline is stored with the commitment. If calculated data is
            available for the base year, you can accept it as a suggestion; a
            later import or recalculation will not move what was filed.
          </p>
          <div className="mt-10 border-y border-border py-8">
            <CreateTargetForm
              suggestions={suggestions}
              calculationsComplete={evidence.uncalculatedRecords === 0}
            />
          </div>
        </section>

        <section className="mt-20" aria-labelledby="targets-list-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <h2 id="targets-list-heading" className="font-sans text-[28px] leading-8 font-bold">
              Commitments
            </h2>
            <p className="font-mono text-caption text-muted">Newest first</p>
          </div>
          {targets.length === 0 ? (
            <div className="border-y border-border py-14">
              <h3 className="font-sans text-[24px] leading-7 font-bold">
                No target has been set.
              </h3>
              <p className="mt-3 max-w-[34rem] font-serif text-p2 text-muted">
                The first commitment will appear here with its trajectory and,
                when enough complete months exist, its run-rate projection.
              </p>
            </div>
          ) : (
            <ul aria-label="Emissions targets">
              {targets.map((target) => (
                <TargetCard
                  key={target.id}
                  target={target}
                  monthly={evidence.monthly}
                  uncalculatedRecords={evidence.uncalculatedRecords}
                  asOf={asOf}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
