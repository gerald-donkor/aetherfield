import { describe, expect, it } from "vitest";
import * as z from "zod";

import { fieldErrorsFrom } from "./result";
import { demoRequestFieldsSchema, NO_FIELD_ERRORS } from "./lead";
import {
  CUSTOM_FACTOR_FIELDS,
  createCustomFactorSchema,
  EDIT_FACTOR_SET_FIELDS,
  editFactorSetSchema,
} from "./emissions";
import { FACTOR_MAPPING_FIELDS, factorMappingSchema } from "./activity";

/**
 * `fieldErrorsFrom`'s three rules, and the four divergences prompt 121 had to
 * decide when it collapsed 23 hand-rolled copies of this mapping into one
 * function.
 *
 * **This is the first test in `lib/validation/`**, and the `include` in
 * `vitest.config.mts` was widened for it — see the argument in that file's
 * docblock. Every test here calls a function with arguments and asserts on the
 * return value; nothing is mocked, and nothing reaches a database, a browser or
 * a provider.
 *
 * The cases that go through a real schema are there because the equivalence
 * claims are about real issue paths, not about invented ones: whether
 * `factorMappingSchema`'s `superRefine` really emits a single-segment path
 * decides whether the factor picker's behaviour changed, and no hand-written
 * issue can answer that.
 */

/** A stand-in for the one thing the function reads. Deliberately not a
    `ZodError`: the parameter is structurally typed so it cannot see an issue's
    `input` (AGENTS.md 8.3 rule 2), and this asserts that stays true. */
function issues(...list: { path: PropertyKey[]; message: string }[]) {
  return { issues: list };
}

describe("fieldErrorsFrom — rule 1, a field is its path joined with a dot", () => {
  it("keys a top-level issue by its single segment", () => {
    expect(
      fieldErrorsFrom(issues({ path: ["name"], message: "Enter your name." }), [
        "name",
      ]),
    ).toEqual({ name: "Enter your name." });
  });

  it("keys a nested issue by the joined path", () => {
    expect(
      fieldErrorsFrom(
        issues({ path: ["factor", "value"], message: "Enter a value." }),
        ["factor.value"],
      ),
    ).toEqual({ "factor.value": "Enter a value." });
  });

  it("stringifies a numeric segment", () => {
    expect(
      fieldErrorsFrom(
        issues({ path: ["rows", 1, "unit"], message: "Choose a unit." }),
        ["rows.1.unit"],
      ),
    ).toEqual({ "rows.1.unit": "Choose a unit." });
  });

  it("drops an issue whose path names nothing the caller renders", () => {
    expect(
      fieldErrorsFrom(issues({ path: ["source"], message: "Forged." }), [
        "name",
      ]),
    ).toEqual({});
  });
});

describe("fieldErrorsFrom — rule 2, the longest declared prefix wins", () => {
  it("reaches the field that owns an issue landing deeper than it", () => {
    expect(
      fieldErrorsFrom(
        issues({
          path: ["factor", "supersedes", "source"],
          message: "Enter a source.",
        }),
        ["factor.supersedes"],
      ),
    ).toEqual({ "factor.supersedes": "Enter a source." });
  });

  it("prefers the deeper field when both it and its prefix are declared", () => {
    expect(
      fieldErrorsFrom(
        issues({
          path: ["set", "sourceReference"],
          message: "Enter a source URL or an internal source reference.",
        }),
        ["set", "set.sourceReference"],
      ),
    ).toEqual({
      "set.sourceReference":
        "Enter a source URL or an internal source reference.",
    });
  });

  it("drops a path with no declared prefix at any depth", () => {
    expect(
      fieldErrorsFrom(
        issues({ path: ["set", "mode"], message: "Invalid discriminator." }),
        ["set.source", "set.licence"],
      ),
    ).toEqual({});
  });
});

describe("fieldErrorsFrom — rule 3, the first issue to claim a field wins", () => {
  it("keeps the first message and drops the later one", () => {
    expect(
      fieldErrorsFrom(
        issues(
          { path: ["email"], message: "First." },
          { path: ["email"], message: "Second." },
        ),
        ["email"],
      ),
    ).toEqual({ email: "First." });
  });

  /* The divergence the four `for…of` leaves carried: they wrote `||=` over a
     record pre-filled with "", where the adapters wrote `??=`. The two differ
     only for an empty-string message, and no schema in this folder produces
     one — so first-wins is preserved even then, which is what this pins. */
  it("treats an empty first message as the winner, not as absent", () => {
    expect(
      fieldErrorsFrom(
        issues(
          { path: ["email"], message: "" },
          { path: ["email"], message: "Second." },
        ),
        ["email"],
      ),
    ).toEqual({ email: "" });
  });
});

describe("fieldErrorsFrom — an issue with an empty path belongs to no field", () => {
  it("drops it, and leaves the other issues alone", () => {
    expect(
      fieldErrorsFrom(
        issues(
          { path: [], message: 'Unrecognized key: "extraKey"' },
          { path: ["name"], message: "Enter your name." },
        ),
        ["name"],
      ),
    ).toEqual({ name: "Enter your name." });
  });
});

describe("fieldErrorsFrom — the fields argument", () => {
  it("accepts a record keyed by the fields, as the NO_FIELD_ERRORS constants are", () => {
    const parsed = demoRequestFieldsSchema.safeParse({
      name: "",
      email: "not-an-address",
      company: "",
      message: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(
      fieldErrorsFrom(parsed.error, NO_FIELD_ERRORS),
    ).toEqual({
      name: "Enter your name.",
      email: "Enter a valid work email address.",
      company: "Enter your company.",
    });
  });

  it("agrees with z.flattenError on a flat schema, which is what the ten action sites relied on", () => {
    const parsed = demoRequestFieldsSchema.safeParse({
      name: "",
      email: "not-an-address",
      company: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const { fieldErrors } = z.flattenError(parsed.error);
    expect(fieldErrorsFrom(parsed.error, NO_FIELD_ERRORS)).toEqual({
      name: fieldErrors.name?.[0],
      email: fieldErrors.email?.[0],
      company: fieldErrors.company?.[0],
    });
  });
});

describe("fieldErrorsFrom — the real schemas whose behaviour had to be preserved", () => {
  /* The factor picker used `path.includes(field)`, which matches at any depth
     and in any position. That is equivalent to the prefix rule only if every
     issue path is a single segment — including the two the `superRefine`
     adds. */
  it("keys factorMappingSchema's cross-field issue on a single segment", () => {
    const parsed = factorMappingSchema.safeParse({
      category: "electricity",
      unit: "kWh",
      factorId: "8f0f2d3c-0000-4000-8000-000000000000",
      scope2Method: "market_based",
      scope2MarketBasis: null,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(parsed.error.issues.map((issue) => issue.path)).toEqual([
      ["scope2MarketBasis"],
    ]);
    expect(fieldErrorsFrom(parsed.error, FACTOR_MAPPING_FIELDS)).toEqual({
      scope2MarketBasis: parsed.error.issues[0].message,
    });
  });

  /* `customFactorFieldErrors` and the leaf's `fieldErrorsFromIssues` both took
     `path[0] . path[1]` and skipped anything shorter. Every field this form
     renders is two segments deep, so the declared list reproduces that — and
     an issue on the discriminator, which both copies dropped, is still
     dropped. */
  it("keys createCustomFactorSchema's nested issues under set. and factor.", () => {
    const parsed = createCustomFactorSchema.safeParse({
      set: { mode: "existing", setId: "not-a-uuid" },
      factor: {
        publishedUom: "kWh",
        publishedGhgUnit: "kg CO2e",
        scope: "scope_3",
        activityUnit: "kwh",
        gas: "co2e",
        gwpSet: "AR6",
        biogenic: false,
        value: "1.0",
      },
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const fieldErrors = fieldErrorsFrom(parsed.error, CUSTOM_FACTOR_FIELDS);
    expect(fieldErrors["set.setId"]).toBe("Choose a factor set.");

    expect(fieldErrors["factor.scope3Category"]).toBe(
      "Choose a scope 3 category.",
    );
    for (const key of Object.keys(fieldErrors)) {
      expect(key.startsWith("set.") || key.startsWith("factor.")).toBe(true);
    }
  });

  /* `editFactorSetFieldErrors` existed only because it had to keep
     single-segment paths where its sibling took two. One function now serves
     both, because the field list says which. */
  it("keys editFactorSetSchema's issues on single segments", () => {
    const parsed = editFactorSetSchema.safeParse({
      setId: "8f0f2d3c-0000-4000-8000-000000000000",
      source: "",
      datasetVersion: "2026",
      publicationYear: 2026,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      licence: "OGL v3",
      licenceUrl: "",
      sourceUrl: "",
      sourceReference: "",
      notes: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const fieldErrors = fieldErrorsFrom(parsed.error, EDIT_FACTOR_SET_FIELDS);
    expect(fieldErrors.source).toBeDefined();
    expect(fieldErrors.sourceReference).toBe(
      "Enter a source URL or an internal source reference.",
    );
  });
});
