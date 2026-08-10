import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth-schema";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_IMPORT_ROW_STATUSES,
  ACTIVITY_IMPORT_STATUSES,
  ACTIVITY_UNITS,
} from "../validation/activity";
import {
  CH4_VARIANTS,
  EMISSION_SCOPES,
  FACTOR_ACTIVITY_UNITS,
  FACTOR_RESULT_UNITS,
  GHG_GASES,
  GWP_SETS,
  SCOPE2_METHODS,
  SCOPE3_CATEGORIES,
} from "../validation/emissions";
import {
  TARGET_BASELINE_SOURCES,
  TARGET_COVERAGES,
  TARGET_STATUSES,
} from "../validation/targets";

/**
 * The application schema — AGENTS.md 9.1's phase-one entities, and from build
 * step 9 the phase-two tables that carry a tenant.
 *
 * Rules this file is the enforcement point for (AGENTS.md 9.2):
 *
 * - **Enums are declared once, here**, and imported everywhere. Never a string
 *   union re-declared in UI code, and never a boolean where a third state is
 *   already foreseeable.
 * - **Every table carries `created_at`**, and anything with a lifecycle carries
 *   a timestamp per transition rather than only a current-state column.
 * - **Email is stored lowercased and compared lowercased.** Every table holding
 *   one carries a `CHECK (email = lower(email))`, so a caller that forgets is a
 *   write error rather than a duplicated person on a subscriber list.
 * - **Soft delete.** All three tables hold data a person can ask to have
 *   removed, so erasure is one `deleted_at` write with an audit trail rather
 *   than a cascade. Every read filters on it.
 * - **The phase-one three are not tenant-scoped, deliberately.** Leads and
 *   applications belong to Aetherfield, not to a customer. **Every phase-two
 *   table below carries an organisation reference and every query filters on
 *   it** (AGENTS.md 9.2 rule 6) — there is no "add multi-tenancy later" that is
 *   not a rewrite.
 *
 * No auth tables here: Better Auth generates user / session / account /
 * verification / organization / member / invitation itself (AGENTS.md 7.3), and
 * hand-authoring them guarantees a conflict. This file *references* two of them
 * — `organization.id` and `user.id` — which is the direction that is safe: the
 * generated file knows nothing about this one.
 */

/** Which of the three CTAs produced a lead. Without it "which one converts" is
 * unanswerable, because all three write to one table. */
export const leadSource = pgEnum("lead_source", ["hero", "nav", "cta_band"]);

/** The newsletter lifecycle. A state, not a boolean — double opt-in (step 4)
 * needs `pending` to exist before `confirmed` does. */
export const subscriberStatus = pgEnum("subscriber_status", [
  "pending",
  "confirmed",
  "unsubscribed",
]);

/** A demo request, from `/`'s hero, the nav's "Get started", or the CTA band. */
export const lead = pgTable(
  "lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company").notNull(),
    message: text("message"),
    source: leadSource("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("lead_email_lowercase", sql`${t.email} = lower(${t.email})`),
    // The submissions view (step 7) lists newest first.
    index("lead_created_at_idx").on(t.createdAt),
  ],
);

/**
 * A newsletter address and its state. Deliberately one row per address: the
 * check constraint holds `email` lowercased, so the unique index on that column
 * *is* uniqueness on the lowercased value, and re-subscribing after an
 * unsubscribe moves this row back to `pending` rather than forking a second
 * identity for the same person.
 *
 * **The upsert this table is shaped for** (step 4, `subscriber-queries.ts`),
 * with `deleted_at is not null` treated as "no row" throughout:
 *
 * - no row → insert `pending`, both tokens fresh;
 * - `pending` → rotate the confirmation token, re-stamp
 *   `confirmation_token_sent_at`, send again;
 * - `unsubscribed` → back to `pending` with a fresh confirmation token;
 * - `confirmed` → no token, no state change, no email. The action still
 *   reports success, because telling a stranger that an address is already on
 *   the list leaks membership of it.
 */
export const subscriber = pgTable(
  "subscriber",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    status: subscriberStatus("status").notNull().default("pending"),
    /** Opaque, single-use, and rotated on each confirmation send. */
    confirmationToken: text("confirmation_token").notNull(),
    /**
     * When the current confirmation token was issued — **the only column
     * expiry is read from.**
     *
     * `created_at` cannot date it: a resend rotates the token without creating
     * a row, so after one resend `created_at` describes an address and this
     * column describes the link in the person's inbox. Nullable because a row
     * that has been confirmed has no live token to date.
     */
    confirmationTokenSentAt: timestamp("confirmation_token_sent_at", {
      withTimezone: true,
    }),
    /**
     * A second, **stable** token, and it must never be the confirmation one.
     *
     * The confirmation token is single-use and rotated on every resend, so an
     * unsubscribe link built from it would break the moment it rotated — and
     * an unsubscribe link lives in an inbox for years. It would also put a
     * confirmation capability in a marketing footer, where anyone forwarding
     * the message hands it on.
     */
    unsubscribeToken: text("unsubscribe_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("subscriber_email_lowercase", sql`${t.email} = lower(${t.email})`),
    uniqueIndex("subscriber_email_key").on(t.email),
    uniqueIndex("subscriber_confirmation_token_key").on(t.confirmationToken),
    uniqueIndex("subscriber_unsubscribe_token_key").on(t.unsubscribeToken),
  ],
);

/**
 * A job application.
 *
 * `job_slug` is a **reference, not a foreign key** — jobs live in
 * `app/_content/jobs.ts` as typed constants and there is no `job` table. The
 * slug is validated against `JOBS` at write time, and an application must
 * survive the role being closed and removed from that file.
 *
 * The CV is a private blob reference. Never its bytes, and never a public URL:
 * it is read back through a short-lived signed URL minted per authorised
 * request (AGENTS.md 8.3).
 */
export const application = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobSlug: text("job_slug").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message"),
    /** The blob's pathname — what `get()` takes to mint a signed URL. */
    cvPathname: text("cv_pathname").notNull(),
    /** The applicant's own filename, for display in the submissions view. */
    cvFilename: text("cv_filename").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("application_email_lowercase", sql`${t.email} = lower(${t.email})`),
    index("application_job_slug_idx").on(t.jobSlug),
    index("application_created_at_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Phase two — activity-data ingestion (build step 9)                         */
/* -------------------------------------------------------------------------- */

/**
 * The four enums, **built from `lib/validation/activity.ts` rather than
 * restated** (AGENTS.md 9.2 rule 2).
 *
 * The members live there because that module is the one both a browser bundle
 * and this file may import: `pgEnum` runs at module scope, so a client leaf
 * importing *this* file would pull `drizzle-orm/pg-core` into a page's bundle.
 * The same arrangement `ORGANIZATION_ROLES` uses, for the same reason.
 *
 * `pgEnum` wants a mutable tuple and the constants are `readonly`, so each is
 * spread into a fresh array. The spread copies values; it does not re-declare
 * them, and a member added there appears here without a second edit.
 */
export const activityImportStatus = pgEnum("activity_import_status", [
  ...ACTIVITY_IMPORT_STATUSES,
]);

export const activityImportRowStatus = pgEnum("activity_import_row_status", [
  ...ACTIVITY_IMPORT_ROW_STATUSES,
]);

export const activityCategory = pgEnum("activity_category", [
  ...ACTIVITY_CATEGORIES,
]);

export const activityUnit = pgEnum("activity_unit", [...ACTIVITY_UNITS]);

/**
 * The facility an activity is attributed to.
 *
 * **There is no site management UI and that is deliberate** (AGENTS.md 5.2,
 * "do not overbuild"). Sites are created implicitly by an import, upserted by
 * `normalized_name` within the organisation, so a CRUD screen is not step 9's.
 *
 * The unique index is the point of the table: two spellings of one building
 * must not become two sites, which is AGENTS.md 9.2 rule 4's reasoning applied
 * to a name instead of an address. It deliberately spans soft-deleted rows —
 * re-importing a name whose site was removed restores that site rather than
 * forking a second identity for the same building, which is exactly what the
 * rule is about.
 */
export const site = pgTable(
  "site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** As the customer spelled it, for display. */
    name: text("name").notNull(),
    /** `normaliseSiteName()` in `lib/domain/activity-import.ts` — the identity. */
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("site_organization_normalized_name_key").on(
      t.organizationId,
      t.normalizedName,
    ),
  ],
);

/**
 * One uploaded file.
 *
 * **The raw CSV is a private blob reference, never its bytes.** It is a
 * customer's commercial data (AGENTS.md 5.3's last bullet, and 8.3's
 * reasoning), stored privately and read only through a short-lived signed URL
 * minted per authorised request.
 */
export const activityImport = pgTable(
  "activity_import",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Who uploaded it. Read back for the review view's provenance line. */
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The customer's own filename, sanitised, for display only. */
    filename: text("filename").notNull(),
    /** The blob's pathname. Null once the blob has been deleted — which a
        discard does immediately, and which is what makes retention finite
        rather than a permanent archive by default (AGENTS.md 8.3 rule 5). */
    blobPathname: text("blob_pathname"),
    status: activityImportStatus("status").notNull(),
    /** The parsed header row, as a JSON array of strings. The mapping's column
        indices are indices into *this*, which is what lets
        `updateImportMapping` re-check an index server-side rather than trusting
        the browser's idea of how wide the file is. */
    headerRow: text("header_row").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    validRowCount: integer("valid_row_count").notNull().default(0),
    invalidRowCount: integer("invalid_row_count").notNull().default(0),
    /** The resolved `ActivityMapping`, as JSON. */
    columnMapping: text("column_mapping").notNull(),
    /** Set when the file could not be parsed at all — the `failed` state's
        reason, so a person sees why rather than an empty import. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    discardedAt: timestamp("discarded_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("activity_import_organization_created_at_idx").on(
      t.organizationId,
      t.createdAt,
    ),
  ],
);

/**
 * A staged row — what makes this an *import* rather than a parse-and-hope.
 *
 * Nothing reaches `activity_record` until a person has seen the counts and
 * pressed commit, and an invalid row is never committed and never silently
 * dropped: it stays here, visible, with its row number and its reason.
 *
 * **`organization_id` is denormalised on purpose.** It is derivable through
 * `import_id`, and carrying it anyway means every tenant filter reads one
 * table's own column — so no read of staged data can be written that forgets
 * the join and quietly returns another customer's rows.
 */
export const activityImportRow = pgTable(
  "activity_import_row",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => activityImport.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The physical line in the uploaded file, so the number a person is shown
        is the number their editor and their spreadsheet show. */
    rowNumber: integer("row_number").notNull(),
    /** The source fields, as a JSON array of strings. Kept so a mapping
        override can re-coerce without asking for the file again, and so the
        review view can show the row as it arrived. */
    raw: text("raw").notNull(),
    /* The coerced columns, all nullable: an invalid row has some and not
       others, and which ones are missing is the diagnosis. */
    siteName: text("site_name"),
    siteNormalizedName: text("site_normalized_name"),
    activityDate: date("activity_date", { mode: "string" }),
    category: activityCategory("category"),
    description: text("description"),
    quantity: numeric("quantity", { precision: 18, scale: 6 }),
    unit: activityUnit("unit"),
    status: activityImportRowStatus("status").notNull(),
    /** Every problem with the row, in one sentence per field. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("activity_import_row_import_row_number_key").on(
      t.importId,
      t.rowNumber,
    ),
    index("activity_import_row_import_status_idx").on(t.importId, t.status),
  ],
);

/**
 * The committed fact steps 10-13 read.
 *
 * **`quantity` is `numeric`, never a float, and it is read back as a string.**
 * Drizzle's pg column-types page states that `numeric()` without a `mode`
 * yields a string; it is left that way on purpose. These figures end up in
 * regulatory disclosures (AGENTS.md 5.3), and binary floating point is the
 * wrong representation for a number that must survive a round trip exactly —
 * `0.1 + 0.2` is the whole argument.
 *
 * `numeric(18, 6)` is **a judgement, not a measurement**: 12 digits before the
 * point covers a national grid's annual kWh with room to spare, and 6 after it
 * covers a fuel meter's litres. `lib/domain/activity-import.ts` enforces both
 * halves at coercion time, so an over-long value is a legible row error rather
 * than a write failure that takes a whole commit down.
 *
 * **Provenance is kept.** `import_id` and `import_row_id` are what let step 13
 * trace a disclosed figure back to the row a customer uploaded. They are not
 * redundant and are not to be dropped.
 */
export const activityRecord = pgTable(
  "activity_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => site.id),
    activityDate: date("activity_date", { mode: "string" }).notNull(),
    category: activityCategory("category").notNull(),
    description: text("description"),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    unit: activityUnit("unit").notNull(),
    /* Nullable so a record can outlive its import's erasure, and so a later
       ingestion path that is not a CSV has somewhere to land. */
    importId: uuid("import_id").references(() => activityImport.id, {
      onDelete: "set null",
    }),
    importRowId: uuid("import_row_id").references(() => activityImportRow.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("activity_record_organization_date_idx").on(
      t.organizationId,
      t.activityDate,
    ),
    index("activity_record_organization_category_idx").on(
      t.organizationId,
      t.category,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Phase two — emission factors and the calculation engine (build step 10)     */
/* -------------------------------------------------------------------------- */

/**
 * The eight enums this step adds, **built from `lib/validation/emissions.ts`
 * rather than restated** — the arrangement the four activity enums above
 * already use, and for the same bundling reason (AGENTS.md 9.2 rule 2).
 */
export const emissionScope = pgEnum("emission_scope", [...EMISSION_SCOPES]);

export const scope3Category = pgEnum("scope3_category", [...SCOPE3_CATEGORIES]);

export const scope2Method = pgEnum("scope2_method", [...SCOPE2_METHODS]);

export const gwpSet = pgEnum("gwp_set", [...GWP_SETS]);

export const ghgGas = pgEnum("ghg_gas", [...GHG_GASES]);

export const ch4Variant = pgEnum("ch4_variant", [...CH4_VARIANTS]);

export const factorResultUnit = pgEnum("factor_result_unit", [
  ...FACTOR_RESULT_UNITS,
]);

export const factorActivityUnit = pgEnum("factor_activity_unit", [
  ...FACTOR_ACTIVITY_UNITS,
]);

/**
 * Whether a set's rows were taken as the publisher's **combined** CO2e figure
 * or as its **per-gas** siblings. Recorded on the set, because taking both
 * double-counts and the choice must be visible on the thing it was made about.
 *
 * DEFRA ships a `kg CO2e` row *and* `kg CO2e of CO2 / CH4 / N2O per unit` rows
 * for the same activity — `1_100_1000_15_1` beside `…_2`, `…_3`, `…_4`. They
 * are the same emission expressed two ways.
 */
export const factorGasBasis = pgEnum("factor_gas_basis", [
  "combined_co2e",
  "per_gas",
]);

/**
 * One publication of a factor dataset.
 *
 * **`organization_id` is nullable here, and that is the one deliberate
 * deviation from AGENTS.md 9.2 rule 6** — approved by the user on 10 Aug 2026,
 * with the rule amended in the same change to name reference tables as its
 * exception.
 *
 * `null` means published reference data, shared by every tenant; non-null means
 * a set a customer supplied under its own licence. **Every read filters
 * `organization_id IS NULL OR organization_id = $1`**, so no cross-tenant read
 * is possible, which is what rule 6 exists to guarantee. Duplicating 7,035
 * factor rows per organisation would be the alternative, and the IEA finding
 * recorded in `docs/backend.md` means a tenant may genuinely need to bring its
 * own licensed set one day.
 *
 * **A published set is itself mutable, so the version is not the year.** The
 * 2026 workbook is `Version 1.2` and eGRID2023 was revised twice inside six
 * months. `dataset_version` is what makes a restatement reproducible.
 *
 * **Revisions supersede; they never overwrite.** A new revision inserts a new
 * set and points the old one at it through `superseded_by_set_id`, because a
 * factor row edited in place stops last year's disclosure reproducing.
 */
export const emissionFactorSet = pgTable(
  "emission_factor_set",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for published reference data — see the docblock. */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** The publisher, as an identifier rather than a display name: `DESNZ`. */
    source: text("source").notNull(),
    /** The publisher's own revision string, never a bare year: `1.2`. */
    datasetVersion: text("dataset_version").notNull(),
    publicationYear: integer("publication_year").notNull(),
    /**
     * The activity dates this set applies to. **A factor is selected by the
     * activity's date, not by today's** — DEFRA's own instruction is that the
     * 2026 factors are "for use with activity data that falls entirely or
     * mostly within 2026", so a restatement of an earlier year re-selects
     * against that year's set rather than the current one.
     */
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }).notNull(),
    /** Attribution is a licence condition, so it is stored beside the data and
        rendered wherever the factors are surfaced — never hard-coded in a
        component that a second dataset would make wrong. */
    licence: text("licence").notNull(),
    licenceUrl: text("licence_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    gasBasis: factorGasBasis("gas_basis").notNull(),
    supersededBySetId: uuid("superseded_by_set_id").references(
      (): AnyPgColumn => emissionFactorSet.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    /**
     * Two partial unique indexes rather than one over three columns, because
     * **`NULL` is not equal to `NULL` in a unique index**: a single
     * `(organization_id, source, dataset_version)` index would let the same
     * published set be seeded twice, since both rows' null organisation would
     * compare unequal. The seeder's idempotence depends on this being right.
     */
    uniqueIndex("emission_factor_set_published_key")
      .on(t.source, t.datasetVersion)
      .where(sql`${t.organizationId} is null`),
    uniqueIndex("emission_factor_set_organization_key")
      .on(t.organizationId, t.source, t.datasetVersion)
      .where(sql`${t.organizationId} is not null`),
    index("emission_factor_set_effective_idx").on(t.effectiveFrom, t.effectiveTo),
  ],
);

/**
 * One published factor row.
 *
 * **The publisher's own hierarchy is kept verbatim beside the normalised
 * keys.** `level_1` through `level_4`, `column_text`, `published_uom` and
 * `published_ghg_unit` are exactly what the source file said; `scope`,
 * `activity_unit`, `result_unit`, `gas` and `gwp_set` are this codebase's
 * reading of it. Keeping both means a person can check the reading against the
 * source without opening the workbook, and a normalisation bug is a repairable
 * mistake rather than lost data.
 *
 * **`organization_id` is denormalised from the set on purpose** — the same
 * reasoning `activity_import_row` records. It is derivable through `set_id`,
 * and carrying it anyway means every tenant filter reads one table's own
 * column, so no read of factor data can be written that forgets the join.
 *
 * **`result_unit` is load-bearing, not descriptive.** 514 rows of the 2026 set
 * convert an activity into kWh rather than into kgCO2e, and the engine refuses
 * any factor whose numerator is not `kg_co2e` rather than summing energy into a
 * carbon total.
 */
export const emissionFactor = pgTable(
  "emission_factor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setId: uuid("set_id")
      .notNull()
      .references(() => emissionFactorSet.id, { onDelete: "cascade" }),
    /** Null for published reference data, mirroring the set. */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** The publisher's stable row identifier — DEFRA's `1_100_1000_15_1`. What
        makes the seeder idempotent, and what lets a revision be diffed against
        its predecessor row by row. */
    sourceRowId: text("source_row_id").notNull(),

    /* The publisher's hierarchy, verbatim. */
    level1: text("level_1"),
    level2: text("level_2"),
    level3: text("level_3"),
    level4: text("level_4"),
    columnText: text("column_text"),
    publishedUom: text("published_uom").notNull(),
    publishedGhgUnit: text("published_ghg_unit").notNull(),

    /* This codebase's normalised reading of it. */
    scope: emissionScope("scope").notNull(),
    scope3Category: scope3Category("scope3_category"),
    /** Set only on scope 2 rows. **The method travels with the figure**, which
        the Scope 2 Guidance requires; this step produces `location_based`
        only, and the column exists from the first migration so market-based is
        later a seeder change rather than a schema rewrite. */
    scope2Method: scope2Method("scope2_method"),
    activityUnit: factorActivityUnit("activity_unit").notNull(),
    resultUnit: factorResultUnit("result_unit").notNull(),
    gas: ghgGas("gas").notNull(),
    /** Required for CH4, null for every other gas — `lib/domain/gwp.ts`
        records why combustion and fugitive methane take different values. */
    ch4Variant: ch4Variant("ch4_variant"),
    /** **Per row, never per dataset.** DEFRA's 2026 methodology puts some fuel
        families on AR4 and most on AR5, and refrigerants without an AR5 value
        on AR6. */
    gwpSet: gwpSet("gwp_set").notNull(),
    /** The grid, country or region the row applies to, where the publisher
        states one. Null for a row that is not regional. */
    region: text("region"),
    /** Biomass CO2, which "shall not be included in scope 1 but reported
        separately". Carried out of every scope total by
        `lib/domain/emissions.ts`, never added to one. */
    biogenic: boolean("biogenic").notNull().default(false),

    /**
     * The published value at full precision.
     *
     * **`numeric(24, 17)` is measured, not copied.** Across the 7,035 valued
     * rows of the 2026 flat file the maximum is 17 decimal places and 5 integer
     * digits; 24 total leaves two digits of headroom on each side. The
     * derivation, and the 28 rows of Excel float noise that had to be removed
     * before the measurement meant anything, are in `docs/backend.md`.
     */
    value: numeric("value", { precision: 24, scale: 17 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("emission_factor_set_row_key").on(t.setId, t.sourceRowId),
    index("emission_factor_organization_scope_idx").on(t.organizationId, t.scope),
    index("emission_factor_set_scope_idx").on(t.setId, t.scope),
  ],
);

/**
 * The organisation's chosen factor for one `(category, unit)` pair — **the
 * deterministic matcher, and the honest reading of a thin activity model.**
 *
 * `activity_record` carries a category from a set of eight, a unit from a set
 * of eight, a free-text description and a site with only a name. There is no
 * fuel type, no region and no calorific-value flag. Sixty-four pairs cannot
 * address 7,035 factor rows, and pretending otherwise is how a plausible wrong
 * number reaches a disclosure.
 *
 * So the mapping is explicit, organisation-scoped, seeded with a small default
 * set and otherwise **empty** — and every record whose pair has no row here is
 * surfaced as unmatched, contributes nothing to any total, and is counted in
 * the coverage figure shown beside every figure it is absent from. That is
 * AGENTS.md 5.3's "surfaced, never silently accepted" applied to a
 * deterministic matcher.
 *
 * **Strictly tenant-scoped and `not null`** — unlike the two reference tables
 * above, this is a customer's own choice about its own data, and rule 6 applies
 * to it unchanged.
 */
export const activityFactorMapping = pgTable(
  "activity_factor_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    category: activityCategory("category").notNull(),
    unit: activityUnit("unit").notNull(),
    factorId: uuid("factor_id")
      .notNull()
      /* Deliberately not `cascade`: a factor row disappearing must not silently
         un-map a customer's category. A set is superseded, not deleted. */
      .references(() => emissionFactor.id, { onDelete: "restrict" }),
    /** Who chose it, for the provenance line. Null for the seeded defaults,
        which no person chose. */
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("activity_factor_mapping_key").on(
      t.organizationId,
      t.category,
      t.unit,
    ),
    index("activity_factor_mapping_factor_idx").on(t.factorId),
  ],
);

/**
 * One computed emission, for one `activity_record`.
 *
 * **It persists the factor row it used, not just the number.** A figure that
 * reaches a filing has to be re-derivable years later, when the mapping has
 * moved on and the factor set has been superseded twice: `factor_id`,
 * `gwp_set` and `engine_version` together say exactly how this number was
 * produced, and `activity_record.import_id` already says which uploaded row it
 * came from. Storing only the total would make a restatement a guess.
 *
 * **`scope`, `scope3_category`, `scope2_method`, `biogenic` and
 * `outside_of_scopes` are denormalised from the factor deliberately.** They are
 * what the figure was computed under, and a later revision of the factor row
 * must not retroactively move a filed number into a different scope.
 *
 * **No `deleted_at`, and that is not an omission.** AGENTS.md 9.2 rule 5 is
 * about data a person can ask to have removed; this row is derived, holds
 * nothing a person supplied, and is replaced wholesale on every recalculation.
 * It cascades from the record it describes, so an erasure there removes it.
 */
export const activityEmission = pgTable(
  "activity_emission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    activityRecordId: uuid("activity_record_id")
      .notNull()
      .references(() => activityRecord.id, { onDelete: "cascade" }),
    factorId: uuid("factor_id")
      .notNull()
      .references(() => emissionFactor.id, { onDelete: "restrict" }),

    /**
     * The result, exact and **unrounded** — rounding happens once, at
     * presentation (`lib/domain/decimal.ts`).
     *
     * **`numeric(50, 24)` is derived, not guessed.** The product is a
     * `numeric(18, 6)` quantity, a `numeric(24, 17)` factor and a GWP of up to
     * 5 integer digits and 1 decimal place: at most 12 + 5 + 5 = 22 integer
     * digits and exactly 6 + 17 + 1 = 24 decimal places. 24 is therefore the
     * scale the arithmetic can actually produce, and 50 leaves four integer
     * digits of headroom above the 46 required.
     */
    kgCo2e: numeric("kg_co2e", { precision: 50, scale: 24 }).notNull(),

    scope: emissionScope("scope").notNull(),
    scope3Category: scope3Category("scope3_category"),
    scope2Method: scope2Method("scope2_method"),
    gwpSet: gwpSet("gwp_set").notNull(),
    biogenic: boolean("biogenic").notNull(),
    outsideOfScopes: boolean("outside_of_scopes").notNull(),
    /** `ENGINE_VERSION` from `lib/domain/emissions.ts` at the time of the run. */
    engineVersion: text("engine_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /** One computed figure per record. A recalculation replaces the row rather
        than appending a second, so a total can never double-count a record. */
    uniqueIndex("activity_emission_record_key").on(t.activityRecordId),
    index("activity_emission_organization_scope_idx").on(
      t.organizationId,
      t.scope,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Phase two — targets and forecasting (build step 11)                        */
/* -------------------------------------------------------------------------- */

/**
 * The three enums this step adds, **built from `lib/validation/targets.ts`
 * rather than restated** — the arrangement the twelve enums above already use,
 * and for the same bundling reason (AGENTS.md 9.2 rule 2).
 */
export const targetCoverage = pgEnum("target_coverage", [...TARGET_COVERAGES]);

export const targetStatus = pgEnum("target_status", [...TARGET_STATUSES]);

export const targetBaselineSource = pgEnum("target_baseline_source", [
  ...TARGET_BASELINE_SOURCES,
]);

/**
 * One absolute emissions-reduction commitment.
 *
 * **Strictly tenant-scoped, `not null`.** §9.2 rule 6's reference-data
 * exception covers a third party's *published* dataset — `emission_factor_set`
 * and `emission_factor`, and nothing else. A target is a customer's own
 * commitment about its own emissions, so the rule applies to it unchanged and
 * every query below filters on `organization_id`.
 *
 * **Absolute targets only** (settled with the user before the prompt was
 * written): base year, baseline figure, target year, percentage reduction. An
 * intensity target needs a denominator series — revenue, floor area, headcount
 * — that the schema carries nowhere, and inventing one here would be a second
 * import path pretending to be a column.
 *
 * **The baseline is stored, never re-derived.** `baseline_kg_co2e` is what the
 * company filed against, whether they typed it or accepted the computed
 * suggestion, and no recalculation, newly committed import or changed factor
 * mapping may move it. `computed_baseline_kg_co2e` is a *snapshot* of what the
 * engine computed for the base year at the moment the target was created, kept
 * so the surface can show a reporter that their filed baseline and the current
 * data have diverged. That divergence is information, not an error to hide.
 *
 * **Whether the target has been met is not a column.** It is computed from the
 * current data on every read (`lib/domain/targets.ts`); only `active` /
 * `retired` — a human decision — is stored, with `retired_at` as its transition
 * timestamp (§9.2 rule 3). A stored `achieved` would be a derivation that goes
 * stale the moment an import lands.
 */
export const emissionTarget = pgTable(
  "emission_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The reporter's own name for it — "Operational 2030", "SBTi near-term". */
    name: text("name").notNull(),
    coverage: targetCoverage("coverage").notNull(),
    baseYear: integer("base_year").notNull(),
    targetYear: integer("target_year").notNull(),

    /**
     * The committed reduction, as a percentage of the baseline.
     *
     * **`numeric(6, 3)` is derived from the input bound**, not chosen:
     * `lib/validation/targets.ts` admits `(0, 100]` to three decimal places, so
     * the widest value is `100.000` — three integer digits and three decimal
     * places, six in total, exactly.
     */
    reductionPercent: numeric("reduction_percent", {
      precision: 6,
      scale: 3,
    }).notNull(),

    /**
     * The filed base-year figure, in **kgCO2e** — the unit the engine and
     * `activity_emission` work in, so no conversion sits between this column
     * and the figures it is compared against.
     *
     * **`numeric(20, 3)` is derived from the input bound**, and it is *not*
     * `activity_emission.kg_co2e`'s `numeric(50, 24)`: that scale is what the
     * product of a quantity, a factor and a GWP can produce, and a
     * human-entered baseline is a different quantity. The form takes tCO2e
     * bounded at 12 integer digits and 3 decimal places
     * (`TARGET_BASELINE_INTEGER_DIGITS` / `TARGET_BASELINE_DECIMALS`).
     * Converting to kg is ×1000, an exact scale-preserving shift, so the stored
     * value carries at most 15 integer digits and exactly 3 decimal places — 18
     * digits required. 20 leaves two integer digits of headroom.
     */
    baselineKgCo2e: numeric("baseline_kg_co2e", {
      precision: 20,
      scale: 3,
    }).notNull(),

    baselineSource: targetBaselineSource("baseline_source").notNull(),

    /**
     * What the engine computed for the base year when the target was created,
     * in kgCO2e. Null when the organisation had no calculated emissions for
     * that year at the time — which is an ordinary state, not a fault.
     *
     * **Rounded to the gram on the way in**, because the engine's sum carries
     * `activity_emission.kg_co2e`'s 24 decimal places and this column carries 3.
     * That rounding is stated rather than silent (§12 rule 4) and it is
     * defensible here where it would not be on a stored disclosure figure: this
     * is a comparison snapshot a person reads, not a number that is filed.
     */
    computedBaselineKgCo2e: numeric("computed_baseline_kg_co2e", {
      precision: 20,
      scale: 3,
    }),

    status: targetStatus("status").notNull().default("active"),
    /** Who set it, for the provenance line. A deleted account clears this
        attribution rather than cascading away the organisation's commitment. */
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The `retired` transition's timestamp — a column per transition, not just
        a current-state column (§9.2 rule 3). */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("emission_target_organization_target_year_idx").on(
      t.organizationId,
      t.targetYear,
    ),
    /** The surface lists newest first, the same read idiom `/activity` uses. */
    index("emission_target_organization_created_at_idx").on(
      t.organizationId,
      t.createdAt,
    ),
    /**
     * **No uniqueness constraint, deliberately.** There is no natural key here
     * that is not wrong: a company legitimately holds an interim and a long-term
     * target for the same coverage, two targets for one year on different
     * coverages, and — because retiring is a soft transition rather than a
     * delete — a retired target alongside the active one that replaced it. Any
     * unique index over `(organization_id, coverage, target_year)` would reject
     * the third case, which is the ordinary one.
     */
  ],
);

export type EmissionTarget = typeof emissionTarget.$inferSelect;
export type NewEmissionTarget = typeof emissionTarget.$inferInsert;

export type Lead = typeof lead.$inferSelect;
export type NewLead = typeof lead.$inferInsert;
export type Subscriber = typeof subscriber.$inferSelect;
export type NewSubscriber = typeof subscriber.$inferInsert;
export type Application = typeof application.$inferSelect;
export type NewApplication = typeof application.$inferInsert;

/** The lead's originating surface, for the shared Zod schema in step 2. */
export type LeadSource = (typeof leadSource.enumValues)[number];
export type SubscriberStatus = (typeof subscriberStatus.enumValues)[number];

export type Site = typeof site.$inferSelect;
export type NewSite = typeof site.$inferInsert;
export type ActivityImport = typeof activityImport.$inferSelect;
export type NewActivityImport = typeof activityImport.$inferInsert;
export type ActivityImportRow = typeof activityImportRow.$inferSelect;
export type NewActivityImportRow = typeof activityImportRow.$inferInsert;
export type ActivityRecord = typeof activityRecord.$inferSelect;
export type NewActivityRecord = typeof activityRecord.$inferInsert;

export type EmissionFactorSet = typeof emissionFactorSet.$inferSelect;
export type NewEmissionFactorSet = typeof emissionFactorSet.$inferInsert;
export type EmissionFactor = typeof emissionFactor.$inferSelect;
export type NewEmissionFactor = typeof emissionFactor.$inferInsert;
export type ActivityFactorMapping = typeof activityFactorMapping.$inferSelect;
export type NewActivityFactorMapping = typeof activityFactorMapping.$inferInsert;
export type ActivityEmission = typeof activityEmission.$inferSelect;
export type NewActivityEmission = typeof activityEmission.$inferInsert;

/** Which basis a set's rows were taken on — see `factorGasBasis`. */
export type FactorGasBasis = (typeof factorGasBasis.enumValues)[number];
