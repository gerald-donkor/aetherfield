/**
 * The retention sweep's closed error vocabulary — prompt 81.
 *
 * **Not server-only, like every module beside it**, and it reads no secret and
 * opens no connection. It imports nothing from `lib/db/`: `lib/db/schema.ts`
 * calls `pgEnum` at module scope, so an import in the other direction would put
 * `drizzle-orm/pg-core` into a marketing page's browser bundle
 * (AGENTS.md 6.3). The direction that *is* safe is the one the schema takes —
 * it imports this constant and builds its enum from it, so the vocabulary is
 * declared exactly once (AGENTS.md 9.2 rule 2).
 *
 * **A closed vocabulary, never an exception message.** A driver or provider
 * error can quote a row's data — an address, a name, a blob pathname — and the
 * value written here lands in a stored audit row and in a function log, both of
 * which AGENTS.md 8.3 rule 2 forbids personal data from reaching. The same
 * argument `organization_deletion.purge_error` records for itself; this one is
 * an enum rather than free text so the constraint is the database's, not the
 * caller's memory.
 *
 * The three values, and what each means:
 *
 * - `blob-delete-failed` — a CV's bytes could not be removed, so its row was
 *   left in place and is due again tomorrow. Never the reverse: a deleted row
 *   with a surviving blob orphans a person's CV with the pointer gone.
 * - `application-delete-failed` — the blob went, the row did not.
 * - `sweep-failed` — the run did not complete. Nothing is lost; every due
 *   record is due again on the next run.
 */
export const RETENTION_PURGE_ERRORS = [
  "blob-delete-failed",
  "application-delete-failed",
  "sweep-failed",
] as const;

export type RetentionPurgeError = (typeof RETENTION_PURGE_ERRORS)[number];
