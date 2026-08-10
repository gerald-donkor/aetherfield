import { sql } from "drizzle-orm";
import {
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
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth-schema";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_IMPORT_ROW_STATUSES,
  ACTIVITY_IMPORT_STATUSES,
  ACTIVITY_UNITS,
} from "../validation/activity";

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
