import * as z from "zod";

import type { SubmitResult } from "./result";

/**
 * The job application's input contract — the third module in `lib/validation/`,
 * and bound by the same two rules as the first two (AGENTS.md 6.3):
 *
 * - **not `server-only`**, because the client leaf and the Server Action both
 *   import it and that is the whole point (AGENTS.md 10 rule 1: the rules exist
 *   once and run twice). The client copy is a courtesy to the person filling
 *   the form; the server copy inside the action is the check;
 * - **imports nothing from `lib/db/`**, because `schema.ts` calls `pgEnum` at
 *   module scope and an import here would put `drizzle-orm/pg-core` in
 *   `/careers`'s and `/job-listing/[slug]`'s browser bundles.
 *
 * Three fields, and no more (AGENTS.md 8.3 rule 1 — collect only what the flow
 * needs). No phone number, no LinkedIn URL, no cover-letter upload: a name, an
 * address to reply to, an optional note, and the CV.
 *
 * **`jobSlug` is deliberately not in this schema.** It is composed onto it in
 * the action and validated there against `JOBS` from `app/_content/jobs.ts` —
 * exactly as step 2 composes `source` onto `demoRequestFieldsSchema` rather
 * than importing the database enum into a browser-reachable module. AGENTS.md
 * 9.2 rule 1 makes `job_slug` a reference and not a foreign key, so the check
 * is against the content constants and belongs where they are already in scope.
 * The slug is not a user-facing field either: a bad one is a forged request
 * rather than a typo, and it has no input to render an error against.
 *
 * **The CV is deliberately not in this schema either, and that is a decision
 * rather than an omission.** `z.file()` exists in Zod 4 with `.max()` and
 * `.mime()`, so half the check could live here — but only half. The action must
 * additionally read the leading `%PDF-` bytes, because a browser-declared MIME
 * type is attacker-controlled (AGENTS.md 8.2 rule 3), and that read is async
 * and has no expression in a synchronous object schema. Splitting one check
 * across two modules would leave neither authoritative. So the file's rules
 * live whole in the action, and this module publishes the *constants* both
 * sides need — the leaf spends them on an `accept` attribute and a `.size`
 * comparison, which needs no schema and adds nothing to the bundle.
 *
 * The email is lowercased here, before it reaches the action or the insert, so
 * `application`'s `application_email_lowercase` CHECK can never be the thing
 * that catches a missed `toLowerCase()` (AGENTS.md 9.2 rule 4).
 */

/** Trimmed and lowercased *before* the format check, exactly as
    `lib/validation/lead.ts` and `newsletter.ts` do it: a pasted address with a
    trailing space is corrected rather than rejected. */
const applicantEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: "Enter a valid email address." })
      .max(254, { error: "That email address is too long." }),
  );

export const applicationFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name." })
    .max(120, { error: "Use 120 characters or fewer." }),
  email: applicantEmail,
  /* Optional, and an empty textarea normalises to `undefined` rather than "" —
     `application.message` is nullable and an empty string is not a message. */
  message: z
    .string()
    .trim()
    .max(2000, { error: "Use 2000 characters or fewer." })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** The four things the dialog can show an error against. `cv` has no entry in
    the schema above — its rules run in the action — but it *is* a rendered
    field, so it needs a slot in the error record like the other three. */
export type ApplicationField = "name" | "email" | "message" | "cv";

/** Every field present, empty string for "no error", so the leaf never indexes
    a partial record — the shape `NO_FIELD_ERRORS` in `lead.ts` established. */
export type ApplicationFieldErrors = Record<ApplicationField, string>;

export const NO_FIELD_ERRORS: ApplicationFieldErrors = {
  name: "",
  email: "",
  message: "",
  cv: "",
};

/** The apply action's result, in the shared vocabulary (AGENTS.md 10 rule 2). */
export type ApplicationSubmitResult = SubmitResult<ApplicationField>;

/**
 * The CV's constraints. **Every number here is a judgement, not a
 * measurement** — there is no traffic and no comp to fit against, and the front
 * matter's measured-or-judged rule means saying so rather than implying a fit.
 *
 * 5 MB is comfortably above any typeset CV and far below what would make an
 * unauthenticated upload endpoint worth abusing. `application/pdf` alone keeps
 * step 7's reader to one format and is what a CV is normally sent as;
 * `.doc`/`.docx` are added only if the user asks.
 *
 * Both are enforced server-side in the action — these exports are what lets the
 * leaf reject an obviously wrong file before the round trip, and what keeps the
 * number in the error copy from being written twice.
 */
export const CV_MAX_BYTES = 5 * 1024 * 1024;

/** The size in the register a person reads, so `CV_MAX_BYTES` is never
    hand-converted into a sentence. */
export const CV_MAX_LABEL = "5 MB";

/** The one accepted MIME type — what the action compares `File.type` against
    before it goes on to check the bytes themselves. */
export const CV_ACCEPT = "application/pdf";

/** The `<input type="file" accept="">` value. The extension is listed beside
    the MIME type because some platforms' file pickers filter on one and some on
    the other, and a picker that greys out every file is worse than no filter. */
export const CV_ACCEPT_ATTR = ".pdf,application/pdf";

/**
 * The CV's error copy, in the site's measured, operational register (AGENTS.md
 * 5): what is wrong and what to do, no apology and no exclamation.
 *
 * Written here rather than in the action because the leaf's courtesy check
 * renders the identical sentences — the same "exists once, runs twice"
 * discipline the schema above follows.
 */
export const CV_ERRORS = {
  missing: "Attach your CV as a PDF.",
  type: "Your CV must be a PDF.",
  size: `That file is over ${CV_MAX_LABEL}. Attach a smaller PDF.`,
} as const;
