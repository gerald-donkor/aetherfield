"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { setFactorMapping } from "../../activity/actions";
import {
  FACTOR_MAPPING_ERRORS,
  factorMappingSchema,
  type ActivityCategory,
  type ActivityUnit,
  type FactorMappingField,
} from "../../../lib/validation/activity";
import { Button } from "../primitives";

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
  factors,
  searchMessage,
  searchInvalid,
  children,
}: {
  category: ActivityCategory;
  unit: ActivityUnit;
  factors: SearchFactor[];
  searchMessage: string;
  searchInvalid: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const statusRef = useRef<HTMLDivElement>(null);
  const searchStatusRef = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<FactorMappingField, string>>
  >({});

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  useEffect(() => {
    if (searchMessage) searchStatusRef.current?.focus();
  }, [searchMessage]);

  async function choose(factorId: string) {
    setMessage("");
    setErrors({});

    const input = { category, unit, factorId };
    const checked = factorMappingSchema.safeParse(input);
    if (!checked.success) {
      setMessage(FACTOR_MAPPING_ERRORS.invalid);
      setErrors({
        category: checked.error.issues.find((issue) =>
          issue.path.includes("category"),
        )?.message,
        unit: checked.error.issues.find((issue) => issue.path.includes("unit"))
          ?.message,
        factorId: checked.error.issues.find((issue) =>
          issue.path.includes("factorId"),
        )?.message,
      });
      return;
    }

    setPendingId(factorId);
    try {
      const result = await setFactorMapping(checked.data);
      if (result.ok) {
        setMessage("Factor saved. The organisation's figures have been recalculated.");
        router.refresh();
        setPendingId(null);
        return;
      }

      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
      setPendingId(null);
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
      setPendingId(null);
    }
  }

  return (
    <>
      {children}

      {searchMessage ? (
        <div
          ref={searchStatusRef}
          role={searchInvalid ? "alert" : "status"}
          aria-live={searchInvalid ? "assertive" : "polite"}
          tabIndex={-1}
          className="mt-6 border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none"
        >
          {searchMessage}
        </div>
      ) : null}

      <div
        ref={statusRef}
        role="alert"
        aria-live="assertive"
        tabIndex={-1}
        className={`mt-6 border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "block" : "hidden"
        }`}
      >
        {message}
        {errors.factorId ? (
          <span className="mt-2 block">{errors.factorId}</span>
        ) : null}
      </div>

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
