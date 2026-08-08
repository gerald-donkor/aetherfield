import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * The newsletter's input contract — the second module in `lib/validation/`, and
 * bound by the same two rules as the first (AGENTS.md 6.3):
 *
 * - **not `server-only`**, because the client leaf and the Server Action both
 *   import it and that is the whole point (AGENTS.md 10 rule 1: the rules exist
 *   once and run twice);
 * - **imports nothing from `lib/db/`**, because `schema.ts` calls `pgEnum` at
 *   module scope and an import here would put `drizzle-orm/pg-core` in
 *   `/journal`'s browser bundle.
 *
 * One field. AGENTS.md 8.3 rule 1 is "collect only what the flow needs", and a
 * newsletter needs an address — no name, no company, no consent checkbox
 * (double opt-in *is* the consent record, and the confirmation click is its
 * timestamp).
 */

/** Trimmed and lowercased *before* the format check, exactly as
    `lib/validation/lead.ts` does it: a pasted address with a trailing space is
    corrected rather than rejected, and `subscriber_email_lowercase` can never
    be the thing that catches a missed `toLowerCase()` (AGENTS.md 9.2 rule 4). */
export const newsletterFieldsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: "Enter a valid email address." })
        .max(254, { error: "That email address is too long." }),
    ),
});

/** The one field the band renders. */
export type NewsletterField = "email";

/** Every field present, empty string for "no error", so the leaf never indexes
    a partial record — the shape `NO_FIELD_ERRORS` in `lead.ts` established. */
export type NewsletterFieldErrors = Record<NewsletterField, string>;

export const NO_FIELD_ERRORS: NewsletterFieldErrors = { email: "" };

/** The signup action's result, in the shared vocabulary. */
export type NewsletterSubmitResult = SubmitResult<NewsletterField>;

/**
 * What a token link can turn out to be.
 *
 * **Enumerated rather than collapsed into "something went wrong"** (AGENTS.md
 * 8.2 rules 4 and 5). Each one gets its own copy on the page, because a person
 * whose link expired needs to know to subscribe again, and a person who already
 * confirmed needs to know nothing is broken.
 *
 * `missing` is produced by the page, not the action: it means the URL carried
 * no `token` at all, so there is nothing to submit.
 */
export type NewsletterTokenState =
  | "confirmed"
  | "already-confirmed"
  | "expired"
  | "unsubscribed"
  | "already-unsubscribed"
  | "unknown"
  | "missing";

/**
 * The token actions' result. **Both return this same shape**, and `ok` is about
 * the request rather than the outcome: "your link expired" is a successfully
 * handled request that reports an unhappy state, while `ok: false` is reserved
 * for a rejection the person can retry (a rate limit, an unavailable database).
 *
 * Declared here rather than in `app/_actions/newsletter.ts` because that is a
 * `"use server"` module: every runtime export of one must be an async function,
 * so a type belongs on this side of the boundary.
 */
export type NewsletterTokenResult =
  | { ok: true; state: NewsletterTokenState }
  | { ok: false; error: string };
