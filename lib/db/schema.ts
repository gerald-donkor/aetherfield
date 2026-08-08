import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The phase-one schema — AGENTS.md 9.1's three entities and nothing else.
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
 * - **Not tenant-scoped, deliberately.** Leads and applications belong to
 *   Aetherfield, not to a customer. Phase two's tables carry an organisation
 *   reference; these never will.
 *
 * No auth tables here: Better Auth generates user / session / account /
 * verification itself at build step 6 (AGENTS.md 7.3), and hand-authoring them
 * now guarantees a conflict.
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

export type Lead = typeof lead.$inferSelect;
export type NewLead = typeof lead.$inferInsert;
export type Subscriber = typeof subscriber.$inferSelect;
export type NewSubscriber = typeof subscriber.$inferInsert;
export type Application = typeof application.$inferSelect;
export type NewApplication = typeof application.$inferInsert;

/** The lead's originating surface, for the shared Zod schema in step 2. */
export type LeadSource = (typeof leadSource.enumValues)[number];
export type SubscriberStatus = (typeof subscriberStatus.enumValues)[number];
