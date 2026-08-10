import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_FIELD_LABELS,
  ACTIVITY_FIELDS,
  ACTIVITY_UNITS,
  type ActivityCategory,
  type ActivityField,
  type ActivityMapping,
  type ActivityUnit,
  NO_ACTIVITY_MAPPING,
} from "../validation/activity";

/**
 * Header mapping and row coercion — the second module of the pure domain layer
 * (AGENTS.md 6.2). No database handle, no `fetch`, no clock, no environment.
 * Everything either function needs arrives as an argument.
 *
 * ---
 *
 * **This is where AGENTS.md 5.3's sanctioned AI surface would go, and it is
 * deliberately not here.** Step 9 may map arbitrary vendor CSV headers with
 * structured extraction; the user chose the deterministic build, so this file
 * is a fixed alias table plus a human review step. No AI SDK is installed, no
 * model is named and no prompt is scaffolded.
 *
 * The mapper drops in behind the same review UI later with no rework, because
 * `proposeMapping` already returns a *proposal* that a person overrides through
 * `updateImportMapping`. A model would replace the table and keep the contract.
 *
 * ---
 *
 * **No number produced here is an emission.** `coerceRow` writes back what the
 * file measured — a quantity and the unit it was measured in — and nothing
 * else. Emission factors, coefficients and tCO2e are step 10's, and AGENTS.md
 * 5.3's hard rule keeps that arithmetic deterministic and elsewhere.
 */

/* -------------------------------------------------------------------------- */
/*  Header mapping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The comparison form for a header cell: lowercased, punctuation and runs of
 * whitespace collapsed to single spaces, trimmed.
 *
 * So `Activity_Date`, `activity date`, ` ACTIVITY  DATE ` and `Activity-Date`
 * are one header, and `Qty.` is `qty`.
 */
export function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The alias table. **A judgement, not a measurement** (AGENTS.md 12 rule 4):
 * there is no corpus of customer files to fit it against, and it is the set of
 * headers a utility bill export, a fleet-card statement and a waste-contractor
 * report were expected to use. Extend it when a real file misses; do not guess
 * beyond it at runtime.
 *
 * The canonical name itself is always an alias of itself, so a file that
 * already uses the schema's own words needs no entry.
 */
const HEADER_ALIASES: Record<ActivityField, readonly string[]> = {
  site: [
    "site",
    "site name",
    "facility",
    "facility name",
    "location",
    "building",
    "premises",
    "plant",
    "branch",
  ],
  date: [
    "date",
    "activity date",
    "reading date",
    "invoice date",
    "transaction date",
    "period",
    "period start",
    "month",
  ],
  category: [
    "category",
    "activity category",
    "activity type",
    "type",
    "source",
    "source type",
  ],
  description: [
    "description",
    "activity description",
    "activity",
    "detail",
    "details",
    "item",
    "notes",
    "note",
    "reference",
  ],
  quantity: [
    "quantity",
    "qty",
    "amount",
    "value",
    "consumption",
    "usage",
    "volume",
    "reading",
  ],
  unit: ["unit", "units", "uom", "unit of measure", "measure"],
};

/**
 * Proposes one source column per canonical field, or `null` for unmapped.
 *
 * **It never guesses beyond the table and never invents a column.** An
 * unrecognised header simply leaves its field unmapped, which the review view
 * shows as unmapped and a person resolves with the override control — the
 * outcome AGENTS.md 5.3 requires of a low-confidence match, arrived at without
 * a model.
 *
 * Two guarantees the review view relies on:
 *
 * - **the leftmost matching column wins**, so a file with `Site` and a later
 *   `Site Code` maps the one a person reads first;
 * - **no column is proposed for two fields.** The alias sets are disjoint
 *   today; the claim is enforced rather than assumed, because a later alias
 *   added to two lists would otherwise map one column twice and silently
 *   duplicate a value across two schema fields.
 */
export function proposeMapping(header: readonly string[]): ActivityMapping {
  const normalised = header.map(normaliseHeader);
  const mapping: ActivityMapping = { ...NO_ACTIVITY_MAPPING };
  const taken = new Set<number>();

  for (const field of ACTIVITY_FIELDS) {
    const aliases = new Set<string>([field, ...HEADER_ALIASES[field]]);
    const index = normalised.findIndex(
      (candidate, position) =>
        !taken.has(position) && candidate !== "" && aliases.has(candidate),
    );
    if (index === -1) continue;
    mapping[field] = index;
    taken.add(index);
  }

  return mapping;
}

/* -------------------------------------------------------------------------- */
/*  Row coercion                                                               */
/* -------------------------------------------------------------------------- */

/** One row's worth of committed fact, ready for `activity_record`. */
export type CoercedActivityRow = {
  siteName: string;
  siteNormalizedName: string;
  /** `YYYY-MM-DD`. A calendar date, never an instant: an electricity reading
      belongs to a day, not to a moment in a timezone. */
  activityDate: string;
  category: ActivityCategory;
  description: string | null;
  /** **A decimal string, never a JavaScript number.** It is handed to a
      `numeric` column unchanged, so the digits a customer typed are the digits
      stored. AGENTS.md 5.3's hard rule is about disclosures, and binary
      floating point is the wrong representation for a figure that has to
      survive a round trip exactly. */
  quantity: string;
  unit: ActivityUnit;
};

export type CoerceRowResult =
  | { ok: true; value: CoercedActivityRow }
  | { ok: false; error: string };

const SITE_MAX = 160;
const DESCRIPTION_MAX = 500;

/** `numeric(18, 6)` — see `lib/db/schema.ts`. Enforced here so an over-long
    value is a legible row error rather than a database write failure that
    fails a whole commit. */
const QUANTITY_INTEGER_DIGITS = 12;
const QUANTITY_DECIMAL_DIGITS = 6;

const QUANTITY_PATTERN = new RegExp(
  `^[+-]?\\d{1,${QUANTITY_INTEGER_DIGITS}}(?:\\.\\d{1,${QUANTITY_DECIMAL_DIGITS}})?$`,
);

/** `YYYY-MM-DD` or `YYYY/MM/DD`, and nothing else. */
const DATE_PATTERN = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;

const CATEGORY_BY_NAME = new Map<string, ActivityCategory>(
  ACTIVITY_CATEGORIES.map((value) => [value.toLowerCase(), value]),
);

const UNIT_BY_NAME = new Map<string, ActivityUnit>(
  ACTIVITY_UNITS.map((value) => [value.toLowerCase(), value]),
);

/** The site's comparison form, so two spellings of one building do not become
    two sites — AGENTS.md 9.2 rule 4's reasoning applied to a name. */
export function normaliseSiteName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Coerces one raw record under one mapping.
 *
 * @param mapping the resolved column indices.
 * @param fields the record's source fields, exactly as parsed.
 *
 * Returns either a coerced row or **one message naming every field that is
 * wrong**, so a person fixes a row once rather than discovering its problems
 * one upload at a time.
 */
export function coerceRow(
  mapping: ActivityMapping,
  fields: readonly string[],
): CoerceRowResult {
  const problems: string[] = [];

  function cell(field: ActivityField): string | null {
    const index = mapping[field];
    if (index === null) return null;
    const raw = fields[index];
    return raw === undefined ? null : raw.trim();
  }

  function fail(field: ActivityField, message: string) {
    problems.push(`${ACTIVITY_FIELD_LABELS[field]}: ${message}`);
  }

  /* -- site -------------------------------------------------------------- */
  const siteRaw = cell("site");
  let siteName = "";
  let siteNormalizedName = "";
  if (siteRaw === null) {
    fail("site", "no column is mapped.");
  } else if (siteRaw === "") {
    fail("site", "this row has no value.");
  } else if (siteRaw.length > SITE_MAX) {
    fail("site", `use ${SITE_MAX} characters or fewer.`);
  } else {
    siteNormalizedName = normaliseSiteName(siteRaw);
    if (siteNormalizedName === "") {
      fail("site", "this row has no readable name.");
    } else {
      siteName = siteRaw;
    }
  }

  /* -- date -------------------------------------------------------------- */
  const dateRaw = cell("date");
  let activityDate = "";
  if (dateRaw === null) {
    fail("date", "no column is mapped.");
  } else if (dateRaw === "") {
    fail("date", "this row has no value.");
  } else {
    const parsed = parseIsoDate(dateRaw);
    if (parsed === null) {
      /* **Only unambiguous forms are accepted, and that is the decision.**
         `05/06/2026` is 5 June to a British export and 6 May to an American
         one, and a wrong date silently moves a figure into another reporting
         period. Guessing is worse than asking. */
      fail("date", "use an ISO date, for example 2026-03-31.");
    } else {
      activityDate = parsed;
    }
  }

  /* -- category ---------------------------------------------------------- */
  const categoryRaw = cell("category");
  let category: ActivityCategory | null = null;
  if (categoryRaw === null) {
    fail("category", "no column is mapped.");
  } else if (categoryRaw === "") {
    fail("category", "this row has no value.");
  } else {
    category = CATEGORY_BY_NAME.get(categoryRaw.toLowerCase()) ?? null;
    if (category === null) {
      fail("category", `use one of ${ACTIVITY_CATEGORIES.join(", ")}.`);
    }
  }

  /* -- description ------------------------------------------------------- */
  const descriptionRaw = cell("description");
  let description: string | null = null;
  if (descriptionRaw !== null && descriptionRaw !== "") {
    if (descriptionRaw.length > DESCRIPTION_MAX) {
      fail("description", `use ${DESCRIPTION_MAX} characters or fewer.`);
    } else {
      description = descriptionRaw;
    }
  }

  /* -- quantity ---------------------------------------------------------- */
  const quantityRaw = cell("quantity");
  let quantity = "";
  if (quantityRaw === null) {
    fail("quantity", "no column is mapped.");
  } else if (quantityRaw === "") {
    fail("quantity", "this row has no value.");
  } else if (!QUANTITY_PATTERN.test(quantityRaw)) {
    fail(
      "quantity",
      `use a plain decimal number with no thousands separators, up to ${QUANTITY_INTEGER_DIGITS} digits and ${QUANTITY_DECIMAL_DIGITS} decimal places.`,
    );
  } else {
    /* The string is kept, not parsed. A leading `+` is dropped because
       Postgres `numeric` does not accept one; nothing else is rewritten. */
    quantity = quantityRaw.startsWith("+") ? quantityRaw.slice(1) : quantityRaw;
  }

  /* -- unit -------------------------------------------------------------- */
  const unitRaw = cell("unit");
  let unit: ActivityUnit | null = null;
  if (unitRaw === null) {
    fail("unit", "no column is mapped.");
  } else if (unitRaw === "") {
    fail("unit", "this row has no value.");
  } else {
    unit = UNIT_BY_NAME.get(unitRaw.toLowerCase()) ?? null;
    if (unit === null) {
      fail("unit", `use one of ${ACTIVITY_UNITS.join(", ")}.`);
    }
  }

  if (problems.length > 0 || category === null || unit === null) {
    return { ok: false, error: problems.join(" ") };
  }

  return {
    ok: true,
    value: {
      siteName,
      siteNormalizedName,
      activityDate,
      category,
      description,
      quantity,
      unit,
    },
  };
}

/** `YYYY-MM-DD` / `YYYY/MM/DD` to `YYYY-MM-DD`, or `null` for anything else —
    including a well-formed string naming a day that does not exist. */
function parseIsoDate(value: string): string | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1) return null;
  /* `Date.UTC` rather than `new Date(...)`: the local-time constructor would
     make 29 February's validity depend on the server's timezone, and nothing
     in `lib/domain/` may depend on ambient state. */
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}
