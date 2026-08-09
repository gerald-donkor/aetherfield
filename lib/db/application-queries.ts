import "server-only";

import { getDb } from "./client";
import { application, type NewApplication } from "./schema";

/**
 * The application write path. Mirrors `lead-queries.ts`: nothing outside
 * `lib/db/` writes SQL or calls Drizzle (AGENTS.md 7.5), so the action goes
 * through here.
 *
 * No migration belongs to this file — `application` shipped with step 1's
 * `0000_empty_starjammers.sql`, and `npm run db:generate` producing anything is
 * a signal that the schema was changed, not that this module needs one.
 */
/**
 * Returns the new row's id, for the same reason `insertLead` does: `application.id`
 * is the entity half of the Resend idempotency key
 * (`application-confirmation/<id>`), so two genuine applications key
 * differently and a retry of one cannot double-send.
 *
 * `values.cvPathname` is already written — `application.cv_pathname` is
 * `notNull`, so the blob `put()` precedes this call, and a failure here is what
 * `deleteCv()` compensates for (AGENTS.md 10 stage e).
 */
export async function insertApplication(
  values: NewApplication,
): Promise<string> {
  const [row] = await getDb()
    .insert(application)
    .values(values)
    .returning({ id: application.id });
  return row.id;
}
