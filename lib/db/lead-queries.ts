import "server-only";

import { getDb } from "./client";
import { lead, type NewLead } from "./schema";

/**
 * The lead write path. Mirrors `auth-queries.ts`: nothing outside `lib/db/`
 * writes SQL or calls Drizzle (AGENTS.md 7.5), so the action goes through here.
 *
 * No migration belongs to this file — `lead` shipped with step 1's
 * `0000_empty_starjammers.sql`, and `npm run db:generate` producing anything is
 * a signal that the schema was changed, not that this module needs one.
 */
export async function insertLead(values: NewLead): Promise<void> {
  await getDb().insert(lead).values(values);
}
