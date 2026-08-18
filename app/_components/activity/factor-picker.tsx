"use client";

import { type ReactNode, useState } from "react";

import { setFactorMapping } from "../../activity/actions";
import {
  FACTOR_MAPPING_ERRORS,
  FACTOR_MAPPING_FIELDS,
  factorMappingSchema,
  type ActivityCategory,
  type ActivityUnit,
  type FactorMappingField,
} from "../../../lib/validation/activity";
import type { Scope2MarketBasis } from "../../../lib/validation/emissions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

type SearchFactor = {
  id: string;
  label: string;
  publishedUom: string;
  scope: string;
  gas: string;
  value: string;
  source: string;
  datasetVersion: string;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  customerSupplied: boolean;
  exactTextMatch?: boolean;
  wordingMatch?: {
    band: "close" | "weak";
  };
};

/**
 * The factor picker leaf for `/activity/mappings`.
 *
 * **Component-only** (the bundle rule): no exported constants, no exported
 * types, and no data fetching. The Server Component owns the search query and
 * passes the rows in; this leaf owns only the mutation state and the courtesy
 * schema check before the action re-runs every check server-side.
 *
 * It deliberately adds no visual box. The page owns the bordered sections; the
 * leaf contributes the live status and the per-result forms so the search
 * surface does not become a new primitive.
 */
export function FactorPicker({
  category,
  unit,
  lane,
  basis,
  factors,
  searchMessage,
  searchInvalid,
  children,
}: {
  category: ActivityCategory;
  unit: ActivityUnit;
  /** Which reporting lane the chosen factor is mapped on — prompt 85. `null` is
      the default lane; `"market_based"` is the second scope 2 lane. */
  lane: "market_based" | null;
  /** And which rung of the market-based hierarchy the choice asserts — prompt
      86. Sent only on the market lane; the shared schema refuses it on the
      default lane and refuses its absence on the market one. */
  basis: Scope2MarketBasis;
  factors: SearchFactor[];
  searchMessage: string;
  searchInvalid: boolean;
  children: ReactNode;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const write = useWrite<FactorMappingField>({
    fields: FACTOR_MAPPING_FIELDS,
    fieldsMessage: FACTOR_MAPPING_ERRORS.invalid,
  });
  const { message, errors } = write;

  async function choose(factorId: string) {
    await write.submit({
      parse: () =>
        factorMappingSchema.safeParse({
          category,
          unit,
          factorId,
          scope2Method: lane,
          scope2MarketBasis: lane === "market_based" ? basis : null,
        }),
      // `pendingId` — not the hook's own `pending` — is what this component
      // renders, because only one row's button may show "Saving..." at a
      // time. Set inside `call` rather than before `submit()` so a parse
      // failure never touches it, matching the original: no row-level pending
      // state until the request itself is made.
      call: async (data) => {
        setPendingId(factorId);
        try {
          return await setFactorMapping(data);
        } finally {
          setPendingId(null);
        }
      },
      onSuccess: () =>
        lane !== "market_based"
          ? "Factor saved. The organisation's figures have been recalculated."
          : basis === "grid_average"
            ? "Grid-average fallback saved. This pair's market-based figure is a grid average, recorded as the hierarchy's rung 5 and labelled as a fallback wherever it is shown. The organisation's figures have been recalculated on both lanes."
            : "Market-based rate saved. The organisation's figures have been recalculated on both lanes.",
    });
  }

  return (
    <>
      {children}

      {searchMessage ? (
        <FormStatus
          message={searchMessage}
          as="div"
          role={searchInvalid ? "alert" : "status"}
          className="mt-6"
          pinned
        />
      ) : null}

      <FormStatus message={message} as="div" className="mt-6">
        {message}
        {errors.factorId ? (
          <span className="mt-2 block">{errors.factorId}</span>
        ) : null}
        {errors.scope2MarketBasis ? (
          <span className="mt-2 block">{errors.scope2MarketBasis}</span>
        ) : null}
      </FormStatus>

      {factors.length === 0 ? (
        searchInvalid ? null : (
          <p className="mt-8 max-w-[40rem] font-serif text-p2 text-muted">
            No eligible factors match this search. Try a publisher term, fuel
            family or unit wording from the source dataset.
          </p>
        )
      ) : (
        <ul className="mt-8" aria-label="Eligible emission factors">
          {factors.map((factor) => {
            const pending = pendingId === factor.id;
            return (
              <li
                key={factor.id}
                className="grid gap-5 border-b border-border py-5 first:border-t lg:grid-cols-[1fr_auto] lg:items-start"
              >
                <div className="min-w-0">
                  <p className="wrap-anywhere font-sans text-[17px] leading-6 font-bold text-ink">
                    {factor.label}
                  </p>
                  {factor.wordingMatch ? (
                    <p className="mt-2 font-mono text-[11px] leading-[18px] text-ink uppercase">
                      {factor.wordingMatch.band === "close"
                        ? "Close wording"
                        : "Weak wording match"}
                    </p>
                  ) : factor.exactTextMatch ? (
                    <p className="mt-2 font-mono text-[11px] leading-[18px] text-ink uppercase">
                      Exact text match
                    </p>
                  ) : null}
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MiniDetail label="Unit">{factor.publishedUom}</MiniDetail>
                    <MiniDetail label="Value">{factor.value}</MiniDetail>
                    <MiniDetail label="Scope">{factor.scope}</MiniDetail>
                    <MiniDetail label="Gas">{factor.gas}</MiniDetail>
                  </dl>
                  <p className="mt-3 font-mono text-[11px] leading-[18px] text-muted">
                    {factor.source} {factor.datasetVersion}
                    {factor.customerSupplied ? " · customer-supplied" : ""}
                    {factor.sourceReference
                      ? ` · ${factor.sourceReference}`
                      : ""}
                  </p>
                  {factor.wordingMatch ? (
                    <p className="mt-2 max-w-[40rem] font-mono text-[11px] leading-[18px] text-muted">
                      Ranked only by wording in the label shown above. This can
                      miss synonyms and is not a mapping or a default.
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="secondary"
                  bullet={false}
                  disabled={pendingId !== null}
                  onClick={() => void choose(factor.id)}
                >
                  {pending ? "Saving..." : "Use factor"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function MiniDetail({
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
      <dd className="mt-1 wrap-anywhere font-serif text-[15px] leading-5 text-ink">
        {children}
      </dd>
    </div>
  );
}
