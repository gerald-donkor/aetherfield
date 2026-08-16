import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "./client";
import { SUBMISSIONS_PAGE_SIZE } from "./lead-queries";
import { application, type NewApplication } from "./schema";
import { queryErrorScope } from "./query-error";

/** Every export below is wrapped with this module's half of the error
    label bound once — see {@link queryErrorScope}. */
const safe = queryErrorScope("application-queries");

export type ListedApplication = {
  id: string;
  jobSlug: string;
  name: string;
  email: string;
  message: string | null;
  cvFilename: string;
  createdAt: Date;
};

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
export const insertApplication = safe("insertApplication", insertApplicationImpl);

async function insertApplicationImpl(
  values: NewApplication,
): Promise<string> {
  const [row] = await getDb()
    .insert(application)
    .values(values)
    .returning({ id: application.id });
  return row.id;
}

export const listApplications = safe("listApplications", listApplicationsImpl);

async function listApplicationsImpl(
  page: number,
): Promise<ListedApplication[]> {
  return getDb()
    .select({
      id: application.id,
      jobSlug: application.jobSlug,
      name: application.name,
      email: application.email,
      message: application.message,
      cvFilename: application.cvFilename,
      createdAt: application.createdAt,
    })
    .from(application)
    .where(isNull(application.deletedAt))
    .orderBy(desc(application.createdAt), desc(application.id))
    .limit(SUBMISSIONS_PAGE_SIZE)
    .offset((page - 1) * SUBMISSIONS_PAGE_SIZE);
}

export const countApplications = safe("countApplications", countApplicationsImpl);

async function countApplicationsImpl(): Promise<number> {
  const [row] = await getDb()
    .select({ count: count() })
    .from(application)
    .where(isNull(application.deletedAt));
  return row.count;
}

export const getLiveApplicationCv = safe("getLiveApplicationCv", getLiveApplicationCvImpl);

async function getLiveApplicationCvImpl(id: string) {
  const [row] = await getDb()
    .select({
      pathname: application.cvPathname,
      filename: application.cvFilename,
    })
    .from(application)
    .where(and(eq(application.id, id), isNull(application.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type RemovedApplication = {
  pathname: string;
  removedAt: Date;
};

export const softDeleteApplication = safe("softDeleteApplication", softDeleteApplicationImpl);

async function softDeleteApplicationImpl(
  id: string,
): Promise<RemovedApplication | null> {
  const removedAt = new Date();
  const [row] = await getDb()
    .update(application)
    .set({ deletedAt: removedAt })
    .where(and(eq(application.id, id), isNull(application.deletedAt)))
    .returning({ pathname: application.cvPathname });
  return row ? { pathname: row.pathname, removedAt } : null;
}

/** Restores only the exact removal this request made. */
export const restoreApplicationRemoval = safe("restoreApplicationRemoval", restoreApplicationRemovalImpl);

async function restoreApplicationRemovalImpl(
  id: string,
  removedAt: Date,
): Promise<boolean> {
  const [row] = await getDb()
    .update(application)
    .set({ deletedAt: null })
    .where(
      and(eq(application.id, id), eq(application.deletedAt, removedAt)),
    )
    .returning({ id: application.id });
  return Boolean(row);
}
