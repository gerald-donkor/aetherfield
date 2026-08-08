import * as z from "zod";

import type { SubmitResult as Result } from "./result";

/**
 * The demo request's field rules — the one input contract, shared verbatim by
 * the client leaf and the Server Action (AGENTS.md 6.2, 10 rule 1).
 *
 * **This is the one module under `lib/` that is deliberately not server-only.**
 * It reads no secret and touches no connection, and being importable from the
 * browser is the whole point: the rules exist once and run twice. The client
 * copy is a courtesy to the person filling the form; the server copy inside the
 * action is the check.
 *
 * **It also imports nothing from `lib/db/`, and that is deliberate.**
 * `lib/db/schema.ts` calls `pgEnum` and `pgTable` at module scope, so importing
 * it here would put `drizzle-orm/pg-core` in `/`'s browser bundle. The `source`
 * discriminator is therefore validated against the database enum one layer up,
 * in the action, where `leadSource` is already in scope — see
 * `app/_actions/demo-request.ts`. The union is still never re-declared
 * (AGENTS.md 9.2 rule 2); it is composed onto this schema server-side.
 *
 * The email is lowercased here, before it reaches the action or the insert, so
 * `lead`'s `lead_email_lowercase` CHECK can never be the thing that catches a
 * missed `toLowerCase()` (AGENTS.md 9.2 rule 4).
 */

/** Trimmed and lowercased *before* the format check, so a pasted address with a
    trailing space is corrected rather than rejected. */
const workEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: "Enter a valid work email address." })
      .max(254, { error: "That email address is too long." }),
  );

export const demoRequestFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name." })
    .max(120, { error: "Use 120 characters or fewer." }),
  email: workEmail,
  company: z
    .string()
    .trim()
    .min(1, { error: "Enter your company." })
    .max(160, { error: "Use 160 characters or fewer." }),
  /* Optional, and an empty textarea normalises to `undefined` rather than "" —
     `lead.message` is nullable and an empty string is not a message. */
  message: z
    .string()
    .trim()
    .max(2000, { error: "Use 2000 characters or fewer." })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** The four fields the dialog renders. `source` is never user-facing, so a
    failure on it is a forged request rather than a typo, and it has no field to
    render an error against. */
export type DemoRequestField = "name" | "email" | "company" | "message";

/** Per-field messages, as the dialog holds them. Every field present, empty
    string for "no error", so the leaf never indexes a partial record. */
export type DemoRequestFieldErrors = Record<DemoRequestField, string>;

export const NO_FIELD_ERRORS: DemoRequestFieldErrors = {
  name: "",
  email: "",
  company: "",
  message: "",
};

/**
 * The demo request's typed result (AGENTS.md 10 rule 2).
 *
 * **The shape itself moved to `./result` at step 4** — the newsletter needs the
 * same vocabulary keyed by a different field set, and the point of this folder
 * is that the vocabulary exists once. This alias keeps the name every step-2
 * import already uses, and resolves to exactly what was written here before:
 * `Partial<Record<DemoRequestField, string>>` is `Partial<DemoRequestFieldErrors>`.
 */
export type SubmitResult = Result<DemoRequestField>;
