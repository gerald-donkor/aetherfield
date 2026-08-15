import { describe, expect, it } from "vitest";

import {
  customFactorSchema,
  type CreateCustomFactorInput,
} from "../validation/emissions";
import { parseCsv } from "./csv";
import {
  describeRowIssue,
  duplicateRowErrors,
  factorRowIdentityParts,
  FACTOR_IMPORT_HEADER,
  mixedGasBasisError,
  readFactorImport,
} from "./factor-import";

/** The smallest file that imports: the published header, one valid row. Built
    from `FACTOR_IMPORT_HEADER` rather than a hand-typed line, so a column
    added to the contract without a test is a failing test rather than a
    silently unexercised column. */
const ROW: Record<string, string> = {
  scope: "scope_1",
  activity_unit: "litres",
  gas: "co2e",
  gwp_set: "AR6",
  published_uom: "litres",
  published_ghg_unit: "kg CO2e",
  value: "2.51233",
  biogenic: "false",
  scope3_category: "",
  scope2_method: "",
  ch4_variant: "",
  level_1: "Fuels",
  level_2: "Liquid fuels",
  level_3: "Diesel",
  level_4: "",
  column_text: "Supplier tariff",
  region: "UK",
  supersedes_source: "",
  supersedes_source_row_id: "",
};

function file(
  rows: Record<string, string>[],
  header = FACTOR_IMPORT_HEADER,
): { header: string[]; records: { line: number; fields: string[] }[] } {
  const columns = header.split(",");
  const lines = [
    header,
    ...rows.map((row) =>
      columns.map((column) => row[column.trim().toLowerCase()] ?? "").join(","),
    ),
  ];
  const parsed = parseCsv(`${lines.join("\n")}\n`, 10_000);
  if (!parsed.ok) throw new Error(parsed.error);
  return { header: parsed.header, records: parsed.records };
}

function read(rows: Record<string, string>[], header?: string) {
  const { header: columns, records } = file(rows, header);
  return readFactorImport(columns, records);
}

/** The rows a file produces once the shared schema has judged them — the same
    two steps the action runs, in the same order. */
function factorsOf(rows: Record<string, string>[]) {
  const result = read(rows);
  if (!result.ok) throw new Error(result.error);
  return result.rows.map((row) => {
    const checked = customFactorSchema.safeParse(row.input);
    if (!checked.success) {
      throw new Error(checked.error.issues[0].message);
    }
    return { line: row.line, factor: checked.data };
  });
}

describe("the header contract", () => {
  it("matches column names trimmed and case-insensitively, in any order", () => {
    const reordered = "GAS , Scope,activity_unit,gwp_set,published_uom,published_ghg_unit,value,biogenic";
    const result = read(
      [{ ...ROW, level_1: "", level_2: "", level_3: "", column_text: "", region: "" }],
      reordered,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rowErrors).toEqual([]);
    expect(result.rows[0].input).toMatchObject({
      scope: "scope_1",
      gas: "co2e",
      activityUnit: "litres",
    });
  });

  it("refuses a missing required column by name", () => {
    const result = read(
      [ROW],
      "scope,activity_unit,gas,published_uom,published_ghg_unit,value,biogenic",
    );
    expect(result).toEqual({
      ok: false,
      error:
        "The header is missing gwp_set. Add the column and try again.",
    });
  });

  it("refuses a duplicate header rather than picking one of the two", () => {
    const result = read([ROW], `${FACTOR_IMPORT_HEADER},value`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("names value more than once");
  });

  /* Silently ignoring an unknown column is how a customer's intended data
     never arrives, with nothing on the page saying so. */
  it("refuses an unknown header rather than dropping the column", () => {
    const result = read([ROW], `${FACTOR_IMPORT_HEADER},uncertainty`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("uncertainty");
    expect(result.error).toContain("does not read");
  });
});

describe("per-row coercion", () => {
  it("reads every accepted spelling of biogenic, case-insensitively", () => {
    for (const cell of ["true", "TRUE", "Yes", "1"]) {
      expect(factorsOf([{ ...ROW, biogenic: cell }])[0].factor.biogenic).toBe(
        true,
      );
    }
    for (const cell of ["false", "No", "0"]) {
      expect(factorsOf([{ ...ROW, biogenic: cell }])[0].factor.biogenic).toBe(
        false,
      );
    }
  });

  it("refuses anything else in biogenic, naming the accepted values", () => {
    const result = read([{ ...ROW, biogenic: "maybe" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([]);
    expect(result.rowErrors[0].line).toBe(2);
    expect(result.rowErrors[0].message).toContain("maybe");
    expect(result.rowErrors[0].message).toContain("Accepted values: true, yes");
  });

  it("takes both halves of a supersession or neither", () => {
    const half = read([{ ...ROW, supersedes_source: "DESNZ" }]);
    expect(half.ok).toBe(true);
    if (!half.ok) return;
    expect(half.rows).toEqual([]);
    expect(half.rowErrors[0].message).toContain("go together");

    const whole = factorsOf([
      {
        ...ROW,
        supersedes_source: "DESNZ",
        supersedes_source_row_id: "defra-2026:41",
      },
    ]);
    expect(whole[0].factor.supersedes).toEqual({
      source: "DESNZ",
      sourceRowId: "defra-2026:41",
    });
  });

  it("drops an empty optional rather than passing an empty string on", () => {
    const [row] = factorsOf([{ ...ROW, level_4: "", region: "" }]);
    expect(row.factor.level4).toBeUndefined();
    expect(row.factor.region).toBeUndefined();
  });
});

/* Enum values are accepted verbatim and never guessed at: `Scope 1` is not
   `scope_1`, and mapping it would put a value the customer did not supply into
   a disclosure. */
describe("the verbatim-enum refusal", () => {
  it("refuses a scope that is not a member, and names the members", () => {
    const result = read([{ ...ROW, scope: "Scope 1" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const checked = customFactorSchema.safeParse(result.rows[0].input);
    expect(checked.success).toBe(false);
    if (checked.success) return;

    const issue = checked.error.issues[0];
    const message = describeRowIssue(issue.path.join("."), issue.message);
    expect(message).toContain("scope:");
    expect(message).toContain("Accepted values: scope_1, scope_2");
  });

  it("refuses an activity unit that is not a member", () => {
    const result = read([{ ...ROW, activity_unit: "gallons" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(customFactorSchema.safeParse(result.rows[0].input).success).toBe(
      false,
    );
  });
});

describe("in-file duplicates", () => {
  it("names both lines when two rows are one row in the set", () => {
    const factors = factorsOf([
      ROW,
      { ...ROW, level_3: "Petrol" },
      { ...ROW, published_ghg_unit: "kgCO2e" },
    ]);

    const errors = duplicateRowErrors(factors);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(4);
    expect(errors[0].message).toContain("line 2");
  });

  it("treats case and surrounding space as the same row", () => {
    const factors = factorsOf([ROW, { ...ROW, level_3: " DIESEL " }]);
    expect(duplicateRowErrors(factors)).toHaveLength(1);
  });

  it("keeps two rows that restate different published rows apart", () => {
    const factors = factorsOf([
      { ...ROW, supersedes_source: "DESNZ", supersedes_source_row_id: "a" },
      { ...ROW, supersedes_source: "DESNZ", supersedes_source_row_id: "b" },
    ]);
    expect(duplicateRowErrors(factors)).toEqual([]);
  });

  /* The identity the database hashes, and the reason `lib/db/` imports it
     rather than restating the field list. */
  it("leaves the published GHG unit out of a row's identity", () => {
    const [a, b] = factorsOf([ROW, { ...ROW, published_ghg_unit: "kgCO2e" }]);
    expect(factorRowIdentityParts(a.factor)).toEqual(
      factorRowIdentityParts(b.factor),
    );
  });

  it("appends the supersession pair only when it is declared", () => {
    const plain = factorsOf([ROW])[0].factor;
    const restating = factorsOf([
      { ...ROW, supersedes_source: "DESNZ", supersedes_source_row_id: "a" },
    ])[0].factor;
    expect(factorRowIdentityParts(plain)).toHaveLength(16);
    expect(factorRowIdentityParts(restating)).toHaveLength(18);
  });
});

describe("mixed gas bases", () => {
  const perGas = {
    ...ROW,
    gas: "ch4",
    ch4_variant: "combustion",
    published_ghg_unit: "kg CH4",
  };

  it("refuses a file that mixes combined and per-gas rows, naming both lines", () => {
    const error = mixedGasBasisError(factorsOf([ROW, perGas]));
    expect(error?.line).toBe(3);
    expect(error?.message).toContain("line 2");
  });

  it("accepts a file that is wholly one basis", () => {
    expect(mixedGasBasisError(factorsOf([ROW, { ...ROW, level_3: "Petrol" }])))
      .toBeNull();
    expect(
      mixedGasBasisError(
        factorsOf([perGas, { ...perGas, level_3: "Petrol" }]),
      ),
    ).toBeNull();
  });

  it("has nothing to say about an empty file", () => {
    const empty: { line: number; factor: CreateCustomFactorInput["factor"] }[] =
      [];
    expect(mixedGasBasisError(empty)).toBeNull();
  });
});
