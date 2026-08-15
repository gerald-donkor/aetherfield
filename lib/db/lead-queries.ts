import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "./client";
import { lead, type NewLead } from "./schema";
import { withSafeQueryErrors } from "./query-error";

export const SUBMISSIONS_PAGE_SIZE = 20;

export type ListedLead = {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string | null;
  source: "hero" | "nav" | "cta_band";
  createdAt: Date;
};

/**
 * The lead write path. Mirrors `auth-queries.ts`: nothing outside `lib/db/`
 * writes SQL or calls Drizzle (AGENTS.md 7.5), so the action goes through here.
 *
 * No migration belongs to this file — `lead` shipped with step 1's
 * `0000_empty_starjammers.sql`, and `npm run db:generate` producing anything is
 * a signal that the schema was changed, not that this module needs one.
 */
/**
 * Returns the new row's id. Step 3 needs it: `lead.id` is the entity half of
 * the Resend idempotency key (`demo-request-confirmation/<id>`), so two
 * genuine requests key differently and a retry of one cannot double-send.
 */
export const insertLead = withSafeQueryErrors(
  "lead-queries.insertLead",
  insertLeadImpl,
);

async function insertLeadImpl(values: NewLead): Promise<string> {
  const [row] = await getDb()
    .insert(lead)
    .values(values)
    .returning({ id: lead.id });
  return row.id;
}

export const listLeads = withSafeQueryErrors(
  "lead-queries.listLeads",
  listLeadsImpl,
);

async function listLeadsImpl(page: number): Promise<ListedLead[]> {
  return getDb()
    .select({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      company: lead.company,
      message: lead.message,
      source: lead.source,
      createdAt: lead.createdAt,
    })
    .from(lead)
    .where(isNull(lead.deletedAt))
    .orderBy(desc(lead.createdAt), desc(lead.id))
    .limit(SUBMISSIONS_PAGE_SIZE)
    .offset((page - 1) * SUBMISSIONS_PAGE_SIZE);
}

export const countLeads = withSafeQueryErrors(
  "lead-queries.countLeads",
  countLeadsImpl,
);

async function countLeadsImpl(): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(lead)
    .where(isNull(lead.deletedAt));
  return row.count;
}

/** Returns false for an unknown or already removed row. */
export const softDeleteLead = withSafeQueryErrors(
  "lead-queries.softDeleteLead",
  softDeleteLeadImpl,
);

async function softDeleteLeadImpl(id: string): Promise<boolean> {
  const [row] = await getDb()
    .update(lead)
    .set({ deletedAt: new Date() })
    .where(and(eq(lead.id, id), isNull(lead.deletedAt)))
    .returning({ id: lead.id });
  return Boolean(row);
}
