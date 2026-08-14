import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The authenticated E2E fixture's shared vocabulary — prompt 74.
 *
 * Playwright runs setup, each spec and teardown in **separate processes**, so
 * nothing an in-memory constant holds survives between them. Everything the
 * three halves must agree on is written to `e2e/.auth/run.json` by the setup
 * project and read back from disk by the others.
 *
 * **`e2e/.auth/` is a credential store and is gitignored.** The two
 * `storageState` files hold live Better Auth session cookies; `run.json` holds
 * the run's synthetic addresses and the ids it created. None of it is ever
 * logged (AGENTS.md 8.3 rule 2) and none of it is committed.
 */

export const AUTH_DIR = path.join(__dirname, "..", ".auth");
export const RUN_RECORD_PATH = path.join(AUTH_DIR, "run.json");

/** The organisation owner's session — a member, and the `owner` tenant role. */
export const OWNER_STATE_PATH = path.join(AUTH_DIR, "owner.json");
/** A verified user who belongs to no organisation at all. */
export const ORPHAN_STATE_PATH = path.join(AUTH_DIR, "orphan.json");

/**
 * The tables this fixture can touch. Counted whole before setup and again
 * after teardown, so "the run left the database as it found it" is a readback
 * rather than an assertion about the deletes we happened to write.
 *
 * `rate_limit` is deliberately absent — see `support/database.ts`.
 *
 * **The six activity relations arrived with prompt 77**, whose walk stages and
 * commits one import so `/activity/mappings` has a pair to search against.
 * Four of them are the ones that prompt named; `site` and `activity_import_row`
 * are the two it did not, and they are here because `commitImport` in
 * `lib/db/activity-queries.ts` upserts a `site` per distinct normalised name
 * and `createStagedImport` writes one `activity_import_row` per parsed line.
 * The list is widened rather than the count narrowed: a relation missing from
 * here is a leftover row nothing would fail on.
 *
 * `activity_factor_mapping` and `activity_emission` are counted even though
 * this walk may write neither — nothing on the read paths it visits calls
 * `recalculateOrganization`, and only `setFactorMapping` and the cron sweep do.
 * Counting them is what would catch that changing.
 */
export const COUNTED_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  "site",
  "activity_import",
  "activity_import_row",
  "activity_record",
  "activity_factor_mapping",
  "activity_emission",
] as const;

export type CountedTable = (typeof COUNTED_TABLES)[number];
export type TableCounts = Record<CountedTable, number>;

export type FixtureUser = {
  id: string;
  email: string;
};

export type FixtureOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type RunRecord = {
  /** A per-run suffix, so a crashed run cannot collide with the next one and a
      row it left behind is identifiable rather than anonymous. */
  runId: string;
  users: FixtureUser[];
  /** Every organisation created, for teardown. */
  organizations: FixtureOrganization[];
  /** The one the saved owner session belongs to. */
  ownerOrganization: FixtureOrganization;
  /** A second tenant the owner session is not a member of. Nothing signs into
      it; it exists so the tenant-boundary assertion excludes a name that
      really is in the database, rather than one that never existed. */
  neighbourOrganization: FixtureOrganization;
  /** Whole-relation counts taken before the first fixture row was written. */
  before: TableCounts;
  /** `rate_limit`'s count before setup, reported rather than restored. */
  rateLimitBefore: number;
};

/**
 * A run-scoped synthetic address.
 *
 * `example.com` is reserved by RFC 2606 and can never reach a person, which is
 * the property that matters: even if a send were somehow attempted it could
 * not deliver to a stranger. The run's mail is suppressed outright besides —
 * see `playwright.config.ts`.
 */
export function fixtureEmail(role: string, runId: string): string {
  return `aetherfield-e2e-${role}-${runId}@example.com`;
}

export function fixtureName(role: string): string {
  return `Aetherfield E2E ${role}`;
}

/** New per run, never committed, never logged. */
export function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

export function generateRunId(): string {
  return randomBytes(4).toString("hex");
}

export function writeRunRecord(record: RunRecord): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(RUN_RECORD_PATH, JSON.stringify(record, null, 2), "utf8");
}

/**
 * **Never call this at a spec's module scope.** Playwright loads every test
 * file to enumerate tests *before* the setup project runs, so the record does
 * not exist yet at import time. Read it inside the test that needs it.
 */
export function readRunRecord(): RunRecord {
  return JSON.parse(readFileSync(RUN_RECORD_PATH, "utf8")) as RunRecord;
}
