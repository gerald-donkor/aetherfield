import {
  CH4_VARIANTS,
  EMISSION_SCOPES,
  FACTOR_ACTIVITY_UNITS,
  GHG_GASES,
  GWP_SETS,
  SCOPE2_METHODS,
  SCOPE3_CATEGORIES,
  type CreateCustomFactorInput,
  type FactorImportRowError,
} from "../validation/emissions";
import type { CsvRecord } from "./csv";

/**
 * The bulk factor-set CSV import's file contract — prompt 82.
 *
 * **Pure, like every module beside it** (AGENTS.md 6.2): no database handle, no
 * `fetch`, no clock, no environment. Everything these functions need arrives as
 * an argument, and `lib/domain/factor-import.test.ts` runs the whole contract
 * under `npm test` without a database or a browser.
 *
 * ---
 *
 * ## What this file does and does not decide
 *
 * It maps a parsed CSV onto the object `customFactorSchema` already parses, and
 * it stops there. **The row rules are not restated here** — the action runs
 * `customFactorSchema.safeParse` per row, so the rules exist once and run twice
 * (AGENTS.md 10 rule 1). What lives here is only what a *file* has and a single
 * form does not: a header contract, whole-file refusals, cell coercion, and the
 * two cross-row checks a row-at-a-time path can never need.
 *
 * ---
 *
 * ## Enum values are accepted verbatim, never guessed at
 *
 * `Scope 1` is not `scope_1`, and nothing here maps it to one. This is
 * `lib/domain/csv.ts`'s own stance carried up a layer: a value outside the
 * stated vocabulary is a legible row error naming the accepted members, because
 * a guessed mapping puts a number the customer did not supply into a
 * disclosure (AGENTS.md 5.3).
 *
 * An **unknown header is a whole-file refusal** for the same reason in reverse:
 * silently ignoring a column is how a customer's intended `region` never
 * arrives, and nothing on the page would say so.
 */

/* -------------------------------------------------------------------------- */
/*  The column contract                                                        */
/* -------------------------------------------------------------------------- */

/** The accepted spellings of the `biogenic` cell, lowercased. Written here
    rather than in the schema because it is a *file* concern: the form's control
    is a checkbox and never sees text. */
export const BIOGENIC_TRUE = ["true", "yes", "1"] as const;
export const BIOGENIC_FALSE = ["false", "no", "0"] as const;

/**
 * Every column the importer reads, in the order the header hint prints them.
 *
 * `accepts` points at the **same constants `customFactorSchema` enumerates**, so
 * the vocabulary a refusal names and the vocabulary the parse enforces cannot
 * drift — this is a reference to the enum, not a copy of it.
 */
export const FACTOR_IMPORT_COLUMNS = [
  { column: "scope", field: "scope", required: true, accepts: EMISSION_SCOPES },
  {
    column: "activity_unit",
    field: "activityUnit",
    required: true,
    accepts: FACTOR_ACTIVITY_UNITS,
  },
  { column: "gas", field: "gas", required: true, accepts: GHG_GASES },
  { column: "gwp_set", field: "gwpSet", required: true, accepts: GWP_SETS },
  { column: "published_uom", field: "publishedUom", required: true },
  { column: "published_ghg_unit", field: "publishedGhgUnit", required: true },
  { column: "value", field: "value", required: true },
  {
    column: "biogenic",
    field: "biogenic",
    required: true,
    accepts: [...BIOGENIC_TRUE, ...BIOGENIC_FALSE],
  },
  {
    column: "scope3_category",
    field: "scope3Category",
    required: false,
    accepts: SCOPE3_CATEGORIES,
  },
  {
    column: "scope2_method",
    field: "scope2Method",
    required: false,
    accepts: SCOPE2_METHODS,
  },
  {
    column: "ch4_variant",
    field: "ch4Variant",
    required: false,
    accepts: CH4_VARIANTS,
  },
  { column: "level_1", field: "level1", required: false },
  { column: "level_2", field: "level2", required: false },
  { column: "level_3", field: "level3", required: false },
  { column: "level_4", field: "level4", required: false },
  { column: "column_text", field: "columnText", required: false },
  { column: "region", field: "region", required: false },
  { column: "supersedes_source", field: "supersedes.source", required: false },
  {
    column: "supersedes_source_row_id",
    field: "supersedes.sourceRowId",
    required: false,
  },
] as const;

/** The header row a person copies into their file. One string, so the page
    hint, the tests and this contract cannot disagree about it. */
export const FACTOR_IMPORT_HEADER = FACTOR_IMPORT_COLUMNS.map(
  (column) => column.column,
).join(",");

export const FACTOR_IMPORT_REQUIRED_COLUMNS = FACTOR_IMPORT_COLUMNS.filter(
  (column) => column.required,
).map((column) => column.column);

type FactorRow = CreateCustomFactorInput["factor"];

/** Header cells are matched trimmed and case-insensitively, in any order. A
    spreadsheet writes `Scope` as readily as `scope`, and the two are one
    column. Nothing beyond case and surrounding space is normalised — an
    unknown header is refused rather than guessed at. */
function normaliseColumn(value: string): string {
  return value.trim().toLowerCase();
}

function columnFor(field: string) {
  return FACTOR_IMPORT_COLUMNS.find((column) => column.field === field);
}

/**
 * Turns one failed row rule into the sentence the person reads.
 *
 * The message is the schema's own — this only names the column it belongs to
 * and, where the column has a closed vocabulary, prints it. `path` is the Zod
 * issue path joined with a dot, so `supersedes.source` resolves like any other.
 */
export function describeRowIssue(path: string, message: string): string {
  const column = columnFor(path);
  if (!column) return message;
  const accepted =
    "accepts" in column
      ? ` Accepted values: ${column.accepts.join(", ")}.`
      : "";
  return `${column.column}: ${message}${accepted}`;
}

/* -------------------------------------------------------------------------- */
/*  Reading the file                                                           */
/* -------------------------------------------------------------------------- */

export type FactorImportRead =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: { line: number; input: Record<string, unknown> }[];
      rowErrors: FactorImportRowError[];
    };

/**
 * Maps a parsed CSV onto per-row objects `customFactorSchema` can parse.
 *
 * Whole-file failures are answered **before any row is looked at**, because a
 * mis-typed header produces one legible sentence and ten thousand meaningless
 * row errors.
 *
 * Rows that coerce are returned as `input`; rows that cannot be coerced at all
 * — a wrong cell count, an unreadable `biogenic`, half a supersession — come
 * back as row errors. Everything else is the schema's to judge.
 */
export function readFactorImport(
  header: readonly string[],
  records: readonly CsvRecord[],
): FactorImportRead {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  const unknown: string[] = [];

  header.forEach((cell, index) => {
    const name = normaliseColumn(cell);
    if (seen.has(name)) {
      if (!duplicates.includes(name)) duplicates.push(name);
      return;
    }
    seen.set(name, index);
    if (!FACTOR_IMPORT_COLUMNS.some((column) => column.column === name)) {
      unknown.push(name);
    }
  });

  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `The header names ${listOf(duplicates)} more than once. Give each column one heading and try again.`,
    };
  }
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `The header names ${listOf(unknown)}, which this importer does not read. Remove the column or rename it, so nothing you supplied is silently dropped.`,
    };
  }

  const missing = FACTOR_IMPORT_REQUIRED_COLUMNS.filter(
    (column) => !seen.has(column),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The header is missing ${listOf(missing)}. Add the ${
        missing.length === 1 ? "column" : "columns"
      } and try again.`,
    };
  }

  const rows: { line: number; input: Record<string, unknown> }[] = [];
  const rowErrors: FactorImportRowError[] = [];

  for (const record of records) {
    if (record.fields.length !== header.length) {
      rowErrors.push({
        line: record.line,
        message: `This row has ${record.fields.length} ${
          record.fields.length === 1 ? "value" : "values"
        } and the header names ${header.length} columns.`,
      });
      continue;
    }

    const cell = (column: string): string => {
      const index = seen.get(column);
      return index === undefined ? "" : record.fields[index].trim();
    };

    const biogenicCell = cell("biogenic").toLowerCase();
    const biogenic = BIOGENIC_TRUE.includes(
      biogenicCell as (typeof BIOGENIC_TRUE)[number],
    )
      ? true
      : BIOGENIC_FALSE.includes(
            biogenicCell as (typeof BIOGENIC_FALSE)[number],
          )
        ? false
        : null;
    if (biogenic === null) {
      rowErrors.push({
        line: record.line,
        message: describeRowIssue(
          "biogenic",
          biogenicCell === ""
            ? "Enter a value."
            : `${biogenicCell} is not a value this column takes.`,
        ),
      });
      continue;
    }

    const supersedesSource = cell("supersedes_source");
    const supersedesRowId = cell("supersedes_source_row_id");
    if ((supersedesSource === "") !== (supersedesRowId === "")) {
      rowErrors.push({
        line: record.line,
        message:
          "supersedes_source and supersedes_source_row_id go together. Fill both, or leave both empty.",
      });
      continue;
    }

    rows.push({
      line: record.line,
      input: {
        level1: cell("level_1"),
        level2: cell("level_2"),
        level3: cell("level_3"),
        level4: cell("level_4"),
        columnText: cell("column_text"),
        publishedUom: cell("published_uom"),
        publishedGhgUnit: cell("published_ghg_unit"),
        scope: cell("scope"),
        scope3Category: blankToUndefined(cell("scope3_category")),
        scope2Method: blankToUndefined(cell("scope2_method")),
        activityUnit: cell("activity_unit"),
        gas: cell("gas"),
        ch4Variant: blankToUndefined(cell("ch4_variant")),
        gwpSet: cell("gwp_set"),
        region: cell("region"),
        biogenic,
        value: cell("value"),
        supersedes:
          supersedesSource === ""
            ? undefined
            : { source: supersedesSource, sourceRowId: supersedesRowId },
      },
    });
  }

  return { ok: true, rows, rowErrors };
}

function blankToUndefined(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function listOf(values: readonly string[]): string {
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/*  The two cross-row checks                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The parts of a row that make it *that* row inside its set.
 *
 * **`lib/db/factor-queries.ts` hashes exactly this list**, prefixed with the
 * organisation and set ids, and it imports the function rather than restating
 * the field list — so the in-file duplicate check below and the
 * `(set_id, source_row_id)` unique index agree by construction. `publishedGhgUnit`
 * is deliberately absent: it is the publisher's wording for the numerator, not
 * part of the row's identity.
 *
 * The supersession pair is **appended only when declared** (prompt 71), because
 * appending it unconditionally would move the hash of every row created before
 * that change.
 */
export function factorRowIdentityParts(factor: FactorRow): string[] {
  const parts = [
    factor.level1,
    factor.level2,
    factor.level3,
    factor.level4,
    factor.columnText,
    factor.publishedUom,
    factor.scope,
    factor.scope3Category,
    factor.scope2Method,
    factor.activityUnit,
    factor.gas,
    factor.ch4Variant,
    factor.gwpSet,
    factor.region,
    factor.biogenic ? "biogenic" : "non-biogenic",
    factor.value,
  ].map(normaliseIdentityPart);

  if (factor.supersedes) {
    parts.push(
      normaliseIdentityPart(factor.supersedes.source),
      normaliseIdentityPart(factor.supersedes.sourceRowId),
    );
  }

  return parts;
}

export function normaliseIdentityPart(
  value: string | undefined | null,
): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Two rows in one file that would become one row in the set.
 *
 * Without this they collide on `(set_id, source_row_id)` and the insert's
 * `onConflictDoNothing` discards the second in silence — a customer's file of
 * 400 rows becoming 399 with nothing said. The error names **both** lines,
 * because either one of them may be the mistake.
 */
export function duplicateRowErrors(
  rows: readonly { line: number; factor: FactorRow }[],
): FactorImportRowError[] {
  const firstSeen = new Map<string, number>();
  const errors: FactorImportRowError[] = [];

  for (const row of rows) {
    const key = JSON.stringify(factorRowIdentityParts(row.factor));
    const earlier = firstSeen.get(key);
    if (earlier === undefined) {
      firstSeen.set(key, row.line);
      continue;
    }
    errors.push({
      line: row.line,
      message: `This row is identical to line ${earlier}. Two rows that differ only in published_ghg_unit are one row in the set; remove one.`,
    });
  }

  return errors;
}

/**
 * A file that mixes combined CO2e rows with per-gas rows.
 *
 * A set holds one basis (`gas_basis`, derived and never asked), so such a file
 * has no honest destination: whichever basis the set took, the other rows would
 * be mislabelled. Refused here, before any write, naming the two lines that
 * disagree.
 */
export function mixedGasBasisError(
  rows: readonly { line: number; factor: FactorRow }[],
): FactorImportRowError | null {
  const first = rows[0];
  if (!first) return null;
  const firstCombined = first.factor.gas === "co2e";

  for (const row of rows) {
    if ((row.factor.gas === "co2e") === firstCombined) continue;
    return {
      line: row.line,
      message: `This row is ${row.factor.gas === "co2e" ? "a combined CO2e row" : "a per-gas row"} and line ${first.line} is ${firstCombined ? "a combined CO2e row" : "a per-gas row"}. A set holds one of the two. Split the file and import each part into its own set.`,
    };
  }

  return null;
}
