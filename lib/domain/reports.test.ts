import { describe, expect, it } from "vitest";

import { decimal, type Decimal } from "./decimal";
import { ENGINE_VERSION, type RecordEmission } from "./emissions";
import {
  allowedNumberTokens,
  buildReportEvidence,
  reportPeriod,
  reportSections,
  reportTonnes,
  validateNarrative,
  type BuildReportEvidenceInput,
} from "./reports";
import {
  NARRATIVE_MAX_CHARS,
  REPORT_FORMAT_VERSION,
  type ReportEvidence,
} from "../validation/reports";

/**
 * Build step 13's pure layer.
 *
 * Every test here calls a function with arguments and asserts on its return
 * value: no database, no model, no clock, no mock. The narrative-rejection
 * cases are the ones that matter most — they are the enforcement behind
 * AGENTS.md 5.3's hard rule, and a regression in them would let an invented
 * number reach a disclosure.
 */

const FACTOR_SET = {
  source: "DESNZ",
  datasetVersion: "1.2",
  publicationYear: 2026,
  licence: "Open Government Licence v3.0",
  licenceUrl: "https://example.test/ogl",
  sourceUrl: "https://example.test/factors",
  sourceReference: null,
};

function emission(
  activityDate: string,
  kgCo2e: string,
  overrides: Partial<RecordEmission> = {},
): RecordEmission {
  return {
    recordId: `r-${activityDate}-${kgCo2e}`,
    activityDate,
    kgCo2e: decimal(kgCo2e),
    factorId: "f",
    scope: "scope_1",
    scope3Category: null,
    scope2Method: null,
    gwpSet: "AR5",
    biogenic: false,
    outsideOfScopes: false,
    engineVersion: ENGINE_VERSION,
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildReportEvidenceInput> = {},
): BuildReportEvidenceInput {
  const asOf = overrides.asOf ?? "2026-08-11";
  return {
    asOf,
    period: overrides.period ?? reportPeriod(asOf),
    emissions: [],
    committedRecords: 0,
    uncalculatedRecords: 0,
    factorSets: [FACTOR_SET],
    target: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  The period                                                                 */
/* -------------------------------------------------------------------------- */

describe("reportPeriod", () => {
  it("takes the latest 12 complete months and excludes the current one", () => {
    expect(reportPeriod("2026-08-11")).toEqual({
      startMonth: "2025-08",
      endMonth: "2026-07",
      startDate: "2025-08-01",
      endDate: "2026-07-31",
    });
  });

  it("rolls over January into the previous year", () => {
    expect(reportPeriod("2026-01-01")).toEqual({
      startMonth: "2025-01",
      endMonth: "2025-12",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
  });

  it("ends on 29 February in a leap year", () => {
    expect(reportPeriod("2024-03-15").endDate).toBe("2024-02-29");
  });

  it("ends on 28 February in a common year", () => {
    expect(reportPeriod("2026-03-15").endDate).toBe("2026-02-28");
  });

  it("is unaffected by the day within the current month", () => {
    expect(reportPeriod("2026-08-01")).toEqual(reportPeriod("2026-08-31"));
  });
});

/* -------------------------------------------------------------------------- */
/*  Presentation                                                               */
/* -------------------------------------------------------------------------- */

describe("reportTonnes", () => {
  it("converts kgCO2e to tCO2e exactly and rounds once to three places", () => {
    expect(reportTonnes(decimal("1234567"))).toBe("1234.567");
    expect(reportTonnes(decimal("1000"))).toBe("1.000");
    expect(reportTonnes(decimal("0"))).toBe("0.000");
  });

  it("rounds half to even at the kilogram", () => {
    // 0.5 kg is exactly half a gram-place tie in tonnes.
    expect(reportTonnes(decimal("1500.5"))).toBe("1.500");
    expect(reportTonnes(decimal("1501.5"))).toBe("1.502");
  });

  it("keeps precision beyond the double's safe integer range", () => {
    expect(reportTonnes(decimal("90071992547409910000"))).toBe(
      "90071992547409910.000",
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  Building the snapshot                                                      */
/* -------------------------------------------------------------------------- */

describe("buildReportEvidence", () => {
  it("includes only emissions dated inside the period", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [
          emission("2025-07-31", "1000"), // before the window
          emission("2025-08-01", "2000"), // first day
          emission("2026-07-31", "3000"), // last day
          emission("2026-08-01", "9000"), // the excluded partial month
        ],
        committedRecords: 4,
      }),
    );

    expect(evidence.totals.scope1).toBe("5.000");
    expect(evidence.coverage.calculatedRecords).toBe(2);
  });

  it("keeps biogenic and outside-of-scopes out of every scope total", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [
          emission("2026-01-10", "1000"),
          emission("2026-01-10", "5000", { biogenic: true }),
          emission("2026-01-10", "7000", {
            scope: "outside_of_scopes",
            outsideOfScopes: true,
          }),
        ],
        committedRecords: 3,
      }),
    );

    expect(evidence.totals.total).toBe("1.000");
    expect(evidence.totals.scope1).toBe("1.000");
    expect(evidence.totals.biogenic).toBe("5.000");
    expect(evidence.totals.outsideOfScopes).toBe("7.000");
  });

  it("separates the three scopes and lists scope 3 by category", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [
          emission("2026-01-10", "1000"),
          emission("2026-01-10", "2000", {
            scope: "scope_2",
            scope2Method: "location_based",
          }),
          emission("2026-01-10", "4000", {
            scope: "scope_3",
            scope3Category: "c6_business_travel",
          }),
        ],
        committedRecords: 3,
      }),
    );

    expect(evidence.totals.scope1).toBe("1.000");
    expect(evidence.totals.scope2).toBe("2.000");
    expect(evidence.totals.scope3).toBe("4.000");
    expect(evidence.totals.total).toBe("7.000");
    expect(evidence.scope2Methods).toEqual(["location_based"]);
    expect(evidence.scope3ByCategory).toEqual([
      { category: "c6_business_travel", tonnes: "4.000" },
    ]);
  });

  it("reports an empty period as a caveat rather than a measured zero", () => {
    const evidence = buildReportEvidence(input({ committedRecords: 0 }));

    expect(evidence.totals.total).toBe("0.000");
    expect(evidence.coverage.calculatedRecords).toBe(0);
    expect(
      evidence.caveats.some((c) => c.includes("absence of evidence")),
    ).toBe(true);
  });

  it("names uncalculated records as a gap, and counts them", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [emission("2026-01-10", "1000")],
        committedRecords: 4,
        uncalculatedRecords: 3,
      }),
    );

    expect(evidence.coverage).toEqual({
      calculatedRecords: 1,
      committedRecords: 4,
      uncalculatedRecords: 3,
    });
    expect(
      evidence.caveats.some((c) =>
        c.includes("3 committed records have no calculated emission"),
      ),
    ).toBe(true);
  });

  it("uses the singular for exactly one uncalculated record", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [emission("2026-01-10", "1000")],
        committedRecords: 2,
        uncalculatedRecords: 1,
      }),
    );
    expect(
      evidence.caveats.some((c) =>
        c.includes("1 committed record has no calculated emission"),
      ),
    ).toBe(true);
  });

  it("caveats a missing factor attribution and a missing target", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [emission("2026-01-10", "1000")],
        committedRecords: 1,
        factorSets: [],
      }),
    );

    expect(
      evidence.caveats.some((c) => c.includes("No emission factor set")),
    ).toBe(true);
    expect(evidence.caveats.some((c) => c.includes("No active future target"))).toBe(
      true,
    );
  });

  it("stamps the format and engine versions and the captured clock", () => {
    const evidence = buildReportEvidence(input({ asOf: "2026-08-11" }));
    expect(evidence.formatVersion).toBe(REPORT_FORMAT_VERSION);
    expect(evidence.engineVersion).toBe(ENGINE_VERSION);
    expect(evidence.generatedAsOf).toBe("2026-08-11");
  });

  it("is deterministic — the same inputs produce the same snapshot", () => {
    const build = () =>
      buildReportEvidence(
        input({
          emissions: [
            emission("2026-01-10", "1234.5"),
            emission("2026-02-10", "99.999", { scope: "scope_2" }),
          ],
          committedRecords: 2,
        }),
      );
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("carries a target's projection refusal through as a sentence", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [emission("2026-01-10", "1000")],
        committedRecords: 1,
        target: {
          name: "Operational 2030",
          coverage: "scope_1",
          baseYear: 2020,
          targetYear: 2030,
          reductionPercent: decimal("50"),
          baselineKgCo2e: decimal("100000"),
        },
      }),
    );

    expect(evidence.target?.targetTonnes).toBe("50.000");
    expect(evidence.target?.baselineTonnes).toBe("100.000");
    expect(evidence.target?.projection).toBeNull();
    expect(evidence.target?.projectionRefusal).toContain("12 complete months");
  });

  it("projects a target flat when 12 complete months exist", () => {
    const emissions = Array.from({ length: 12 }, (_, index) =>
      emission(`${index < 5 ? 2025 : 2026}-${monthLabel(index)}-15`, "1000"),
    );
    const evidence = buildReportEvidence(
      input({
        emissions,
        committedRecords: 12,
        target: {
          name: "Operational 2030",
          coverage: "scope_1",
          baseYear: 2020,
          targetYear: 2030,
          reductionPercent: decimal("50"),
          baselineKgCo2e: decimal("100000"),
        },
      }),
    );

    expect(evidence.target?.projection?.basis).toBe("flat");
    expect(evidence.target?.projection?.tonnes).toBe("12.000");
    expect(evidence.target?.readingPercent).toBe("-76.0");
  });
});

/** `2025-08` is offset 0 of the window `reportPeriod("2026-08-11")` returns. */
function monthLabel(offset: number): string {
  const month = ((7 + offset) % 12) + 1;
  return String(month).padStart(2, "0");
}

/* -------------------------------------------------------------------------- */
/*  Narrative validation — the enforcement                                     */
/* -------------------------------------------------------------------------- */

const EVIDENCE: ReportEvidence = buildReportEvidence(
  input({
    emissions: [
      emission("2026-01-10", "1234000"),
      emission("2026-02-10", "500000", {
        scope: "scope_2",
        scope2Method: "location_based",
      }),
      emission("2026-03-10", "250000", {
        scope: "scope_3",
        scope3Category: "c6_business_travel",
      }),
    ],
    committedRecords: 5,
    uncalculatedRecords: 2,
    target: {
      name: "Operational 2030",
      coverage: "scope_1_2",
      baseYear: 2020,
      targetYear: 2030,
      reductionPercent: decimal("42"),
      baselineKgCo2e: decimal("4000000"),
    },
  }),
);

describe("allowedNumberTokens", () => {
  it("admits every figure the snapshot carries", () => {
    const allowed = allowedNumberTokens(EVIDENCE);
    expect(allowed.has("1984.000")).toBe(true); // total
    expect(allowed.has("1234.000")).toBe(true); // scope 1
    expect(allowed.has("500.000")).toBe(true); // scope 2
    expect(allowed.has("250.000")).toBe(true); // scope 3
    expect(allowed.has("2")).toBe(true); // uncalculated records, and Scope 2
    expect(allowed.has("5")).toBe(true); // committed records
  });

  it("admits a figure written without its trailing zeroes", () => {
    const allowed = allowedNumberTokens(EVIDENCE);
    expect(allowed.has("1984")).toBe(true);
    expect(allowed.has("2320")).toBe(true); // target figure 2320.000
  });

  it("admits the scopes, the window length, and the period's parts", () => {
    const allowed = allowedNumberTokens(EVIDENCE);
    expect(allowed.has("1")).toBe(true);
    expect(allowed.has("3")).toBe(true);
    expect(allowed.has("12")).toBe(true);
    expect(allowed.has("2025")).toBe(true);
    expect(allowed.has("2026")).toBe(true);
  });

  it("admits the target's years and reduction, and the factor set version", () => {
    const allowed = allowedNumberTokens(EVIDENCE);
    expect(allowed.has("2020")).toBe(true);
    expect(allowed.has("2030")).toBe(true);
    expect(allowed.has("42.000")).toBe(true);
    expect(allowed.has("42")).toBe(true);
    expect(allowed.has("1.2")).toBe(true);
  });

  it("admits the category number of a scope 3 category that is present", () => {
    expect(allowedNumberTokens(EVIDENCE).has("6")).toBe(true);
  });

  it("does not admit a category number for a category the report lacks", () => {
    expect(allowedNumberTokens(EVIDENCE).has("14")).toBe(false);
  });

  it("admits no figure the snapshot does not carry", () => {
    const allowed = allowedNumberTokens(EVIDENCE);
    expect(allowed.has("4200")).toBe(false);
    expect(allowed.has("18")).toBe(false);
    expect(allowed.has("2031")).toBe(false);
    expect(allowed.has("1985.000")).toBe(false);
  });
});

describe("allowedNumberTokens, market-based", () => {
  /* The validator must admit the figures the engine computed, or a correct
     narrative quoting a market-based total is refused (prompt 85). */
  const evidence = buildReportEvidence(
    input({
      emissions: [
        emission("2026-01-10", "1000", {
          scope: "scope_2",
          scope2Method: "location_based",
        }),
        emission("2026-01-10", "250", {
          scope: "scope_2",
          scope2Method: "market_based",
        }),
      ],
      committedRecords: 1,
    }),
  );

  it("admits the market-based figures and the lane's record counts", () => {
    const allowed = allowedNumberTokens(evidence);
    expect(allowed.has("0.250")).toBe(true);
    expect(allowed.has("0.25")).toBe(true);
  });

  it("accepts a narrative quoting the market-based figure", () => {
    expect(
      validateNarrative(
        "Scope 2 is 1.000 tCO2e location-based and 0.250 tCO2e market-based.",
        evidence,
        500,
      ).ok,
    ).toBe(true);
  });

  it("still refuses a market-based figure the snapshot does not carry", () => {
    const result = validateNarrative(
      "Scope 2 is 0.900 tCO2e market-based.",
      evidence,
      500,
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateNarrative", () => {
  const accept = (text: string) =>
    validateNarrative(text, EVIDENCE, NARRATIVE_MAX_CHARS);

  it("accepts prose whose every figure is in the report", () => {
    expect(
      accept(
        "Over the latest 12 complete months, from 2025-08-01 to 2026-07-31, the inventory totals 1984.000 tCO2e across Scope 1, Scope 2 and Scope 3. Scope 1 accounts for 1234.000 tCO2e and Scope 2 for 500.000 tCO2e.",
      ),
    ).toEqual({ ok: true });
  });

  it("accepts thousands separators over a figure that matches underneath", () => {
    expect(accept("The total is 1,984.000 tCO2e.")).toEqual({ ok: true });
  });

  it("accepts prose containing no figure at all", () => {
    expect(
      accept("Emissions were recorded across all three scopes in the period."),
    ).toEqual({ ok: true });
  });

  it("does not read a unit or an assessment report as a figure", () => {
    /* `tCO2e`, `kgCO2e`, `CO2` and `AR5` all contain digits touching letters. */
    expect(
      accept("Figures are stated in tCO2e, converted from kgCO2e under AR5."),
    ).toEqual({ ok: true });
  });

  it("rejects an invented tonnage", () => {
    const result = accept("The inventory totals 4200.000 tCO2e.");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toBe("unsupported_figure");
      expect(result.reason).toContain("4200.000");
    }
  });

  it("rejects an invented percentage", () => {
    const result = accept("Emissions fell 18% against the prior year.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("unsupported_figure");
  });

  it("rejects an invented year", () => {
    const result = accept("The company expects to meet its goal by 2031.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("2031");
  });

  it("rejects a currency-like figure", () => {
    const result = accept("Abatement is expected to cost 2,500,000 in total.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("unsupported_figure");
  });

  it("rejects a figure that is close to a real one but not equal to it", () => {
    const result = accept("Scope 1 was 1234.500 tCO2e.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("1234.500");
  });

  it("does not let a percentage satisfy a count, or a count a percentage", () => {
    /* 5 is the committed-record count; "5%" is a different claim entirely. */
    const result = accept("Coverage improved by 5%.");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty draft", () => {
    const result = accept("   \n  ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("empty");
  });

  it("rejects a draft over the character cap", () => {
    const result = validateNarrative("word ".repeat(100), EVIDENCE, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe("too_long");
  });
});

/* -------------------------------------------------------------------------- */
/*  Deterministic rendering                                                    */
/* -------------------------------------------------------------------------- */

describe("reportSections", () => {
  it("renders a complete document with no narrative and no model", () => {
    const sections = reportSections(EVIDENCE);
    const keys = sections.map((section) => section.key);

    expect(keys).toEqual([
      "period",
      "totals",
      "scope3",
      "coverage",
      "target",
      "provenance",
      "caveats",
    ]);
    expect(sections.every((section) => section.rows.length + section.notes.length > 0)).toBe(
      true,
    );
  });

  it("puts every figure from the snapshot into the rendered rows verbatim", () => {
    const values = reportSections(EVIDENCE).flatMap((section) =>
      section.rows.map((row) => row.value),
    );
    expect(values).toContain("1984.000");
    expect(values).toContain("1234.000");
    expect(values).toContain("500.000");
    expect(values).toContain("250.000");
  });

  it("labels the scope 2 method beside the figure", () => {
    const scope2 = reportSections(EVIDENCE)
      .find((section) => section.key === "totals")
      ?.rows.find((row) => row.label.startsWith("Scope 2"));
    expect(scope2?.label).toBe("Scope 2 (location-based)");
  });

  it("omits the scope 3 section when no category has a figure", () => {
    const evidence = buildReportEvidence(
      input({ emissions: [emission("2026-01-10", "1000")], committedRecords: 1 }),
    );
    expect(reportSections(evidence).map((s) => s.key)).not.toContain("scope3");
  });

  it("omits the target section when no target was in force", () => {
    const evidence = buildReportEvidence(
      input({ emissions: [emission("2026-01-10", "1000")], committedRecords: 1 }),
    );
    expect(reportSections(evidence).map((s) => s.key)).not.toContain("target");
  });

  /* Prompt 85 — dual reporting in the document itself. */
  it("omits the market-based section when no contractual rate covers the period", () => {
    const evidence = buildReportEvidence(
      input({ emissions: [emission("2026-01-10", "1000")], committedRecords: 1 }),
    );
    expect(evidence.marketBased).toBeUndefined();
    expect(reportSections(evidence).map((s) => s.key)).not.toContain(
      "market-based",
    );
  });

  it("renders both scope 2 readings, labelled, as separate sections", () => {
    const evidence = buildReportEvidence(
      input({
        emissions: [
          emission("2026-01-10", "1000", {
            scope: "scope_2",
            scope2Method: "location_based",
          }),
          emission("2026-01-10", "250", {
            scope: "scope_2",
            scope2Method: "market_based",
          }),
        ],
        committedRecords: 1,
      }),
    );

    /* The location-based figure keeps `scope2` and `total`; the market-based
       one is beside it and in neither. */
    expect(evidence.totals.scope2).toBe("1.000");
    expect(evidence.totals.total).toBe("1.000");
    expect(evidence.marketBased?.scope2).toBe("0.250");
    expect(evidence.marketBased?.total).toBe("0.250");
    /* One record, two figures. */
    expect(evidence.coverage.calculatedRecords).toBe(1);

    const sections = reportSections(evidence);
    expect(sections.map((s) => s.key)).toContain("market-based");
    const totals = sections.find((s) => s.key === "totals");
    expect(
      totals?.rows.find((row) => row.label.startsWith("Scope 2"))?.label,
    ).toBe("Scope 2 (location-based)");
    const market = sections.find((s) => s.key === "market-based");
    expect(market?.rows.map((row) => row.value)).toContain("0.250");
  });

  it("renders every figure it emits as a string, never a number", () => {
    for (const section of reportSections(EVIDENCE)) {
      for (const row of section.rows) {
        expect(typeof row.value).toBe("string");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("purity", () => {
  it("reads no clock — the same asOf gives the same answer at any real time", () => {
    const first = buildReportEvidence(input({ asOf: "2026-08-11" }));
    const second = buildReportEvidence(input({ asOf: "2026-08-11" }));
    expect(first).toEqual(second);
  });

  it("does not mutate its inputs", () => {
    const emissions: RecordEmission[] = [emission("2026-01-10", "1000")];
    const snapshot: Decimal = emissions[0].kgCo2e;
    buildReportEvidence(input({ emissions, committedRecords: 1 }));
    expect(emissions).toHaveLength(1);
    expect(emissions[0].kgCo2e).toBe(snapshot);
  });
});
