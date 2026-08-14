import path from "node:path";

import { del } from "@vercel/blob";
import { Pool } from "pg";

import {
  COUNTED_TABLES,
  type CountedTable,
  type RunRecord,
  type TableCounts,
} from "./fixture";

/**
 * The fixture's own database handle — prompt 74.
 *
 * **Not `lib/db/client.ts`.** That module carries `import "server-only"`,
 * which throws outside the `react-server` condition, and AGENTS.md 6.2's
 * boundary is not something a test may route around. This is a separate,
 * short-lived pool that exists only for the setup and teardown projects.
 *
 * **`DATABASE_URL_UNPOOLED`, not `DATABASE_URL`.** This is session-shaped
 * script work, which is exactly what PgBouncer breaks (AGENTS.md 7.3). The
 * application under test still uses the pooled URL; nothing here changes that.
 *
 * **Nothing but Next.js auto-loads `.env.local`** (AGENTS.md 7.3), and the
 * Playwright runner is not Next.js. `process.loadEnvFile` is Node's own
 * built-in loader, so this needs no dependency of its own — `dotenv` is
 * present in `node_modules` only as a transitive of `dotenv-cli`, and
 * depending on a transitive is a break waiting for an unrelated install.
 */

let pool: Pool | undefined;

/** Loads `.env.local` if the named key is not already exported. Absent is not
    fatal: the variable may come from the environment. Every caller raises its
    own error naming the key, never a value (AGENTS.md 8.4). */
function loadLocalEnv(key: string): void {
  if (process.env[key]) return;
  try {
    process.loadEnvFile(path.join(__dirname, "..", "..", ".env.local"));
  } catch {
    /* Deliberately swallowed — see above. */
  }
}

function connectionString(): string {
  loadLocalEnv("DATABASE_URL_UNPOOLED");

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Pull it with `vercel env pull .env.local`.",
    );
  }
  return url;
}

function getPool(): Pool {
  pool ??= new Pool({ connectionString: connectionString(), max: 2 });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

/**
 * **The fixture's one direct write, and the only row it may not obtain
 * honestly.**
 *
 * Verification arrives by email and AGENTS.md 8.3 forbids a test reaching into
 * a mailbox, so the flag is set here. Everything else the fixture holds — the
 * hashed password, the `account` row's shape, the `member` row's role — comes
 * from the application's own endpoints, because those are the library's
 * business and a fixture that fabricates them stops testing the thing it is
 * meant to test the moment the library changes shape.
 *
 * This is a developer-run script with no request path, exactly like
 * `db:seed:factors`. No authorisation check anywhere in the application is
 * relaxed, parameterised or given a test-only branch to make it work.
 */
export async function markEmailVerified(email: string): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    'UPDATE "user" SET "email_verified" = true WHERE "email" = $1 RETURNING "id"',
    [email],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    // The address is the fixture's own synthetic one, but the rule is the rule:
    // no address reaches a log or an error (AGENTS.md 8.3 rule 2).
    throw new Error("The fixture user was not created by the sign-up endpoint.");
  }
  return id;
}

/**
 * Deletes the private CSVs this run's imports uploaded — prompt 77.
 *
 * **Not `lib/storage/activity-import.ts`.** That module carries
 * `import "server-only"` and the boundary is not something a test may route
 * around, exactly as the pool above is not `lib/db/client.ts`. The package's
 * own `del` is called instead, with the token passed explicitly because
 * nothing but Next.js auto-loads `.env.local` (AGENTS.md 7.3).
 *
 * Best-effort and silent, like the module it mirrors: a delete failure must not
 * replace the teardown's real outcome — the counted readback — with a secondary
 * one, and there is nothing loggable here that is not a customer's data.
 * A store this fixture could not clean is reported by its absence of noise, not
 * by a pathname in a log (8.3 rule 2).
 */
async function removeFixtureImportBlobs(
  organizationIds: string[],
): Promise<void> {
  loadLocalEnv("BLOB_READ_WRITE_TOKEN");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;

  const result = await getPool().query<{ blob_pathname: string }>(
    'SELECT "blob_pathname" FROM "activity_import" WHERE "organization_id" = ANY($1) AND "blob_pathname" IS NOT NULL',
    [organizationIds],
  );
  const pathnames = result.rows.map((row) => row.blob_pathname);
  if (pathnames.length === 0) return;

  try {
    await del(pathnames, { token });
  } catch {
    /* Swallowed deliberately, and silently — see above. */
  }
}

export async function countTables(): Promise<TableCounts> {
  const counts = {} as TableCounts;
  for (const name of COUNTED_TABLES) {
    counts[name] = await countOne(name);
  }
  return counts;
}

export async function countRateLimitRows(): Promise<number> {
  return countOne("rate_limit");
}

/** The name is never user input — it comes from `COUNTED_TABLES`. */
async function countOne(name: CountedTable | "rate_limit"): Promise<number> {
  const result = await getPool().query<{ total: string }>(
    `SELECT count(*)::text AS total FROM "${name}"`,
  );
  return Number(result.rows[0].total);
}

/**
 * Removes every row the run created, in dependency order.
 *
 * `member` and `invitation` go before `organization`, and both of those before
 * `user`, so the deletes stand on their own rather than relying on a cascade
 * to cover a row this function forgot.
 *
 * **`verification` is counted but not deleted**, deliberately. Better Auth's
 * email verification is a signed JWT (`createEmailVerificationToken` in
 * `api/routes/email-verification.mjs`) and writes no row at all, and this
 * fixture never requests a password reset — which is the flow that does write
 * one, keyed by its token rather than by an address. So there is nothing here
 * to target by run id, and the whole-relation readback is what proves it: a row
 * appearing there would fail the readback and be reported rather than
 * quietly swept up by a `LIKE` that guessed at a key format.
 *
 * **`rate_limit` is neither deleted nor asserted on.** Its key is
 * `<ip>|<path>` (`@better-auth/core/utils/ip.mjs`, `createRateLimitKey`) and
 * carries no user reference, so a row this run caused is indistinguishable
 * from one any other local request caused. Better Auth prunes them itself once
 * the window has passed. The delta is reported instead of restored, because
 * inventing a scope for the delete would be worse than naming the gap.
 */
export async function removeFixture(record: RunRecord): Promise<void> {
  const userIds = record.users.map((user) => user.id);
  const organizationIds = record.organizations.map((org) => org.id);

  const client = getPool();

  if (organizationIds.length > 0) {
    /* **Prompt 77's activity relations, deleted before the organisation they
       reference.** In dependency order downwards: an emission references a
       record, a record references a site and an import row, a row references
       an import. Each is scoped by `organization_id`, which every one of them
       carries `not null` (AGENTS.md 9.2 rule 6).

       The blob goes first, while `activity_import` still names it. A committed
       import keeps its uploaded file — only a discard deletes it — so without
       this the walk would leave one private CSV per run in the store forever,
       which is the retention rule read backwards (8.3 rule 5). */
    await removeFixtureImportBlobs(organizationIds);

    await client.query(
      'DELETE FROM "activity_emission" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
    await client.query(
      'DELETE FROM "activity_factor_mapping" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
    await client.query(
      'DELETE FROM "activity_record" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
    await client.query(
      'DELETE FROM "activity_import_row" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
    await client.query(
      'DELETE FROM "activity_import" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
    await client.query('DELETE FROM "site" WHERE "organization_id" = ANY($1)', [
      organizationIds,
    ]);

    await client.query('DELETE FROM "member" WHERE "organization_id" = ANY($1)', [
      organizationIds,
    ]);
    await client.query(
      'DELETE FROM "invitation" WHERE "organization_id" = ANY($1)',
      [organizationIds],
    );
  }

  if (userIds.length > 0) {
    await client.query('DELETE FROM "member" WHERE "user_id" = ANY($1)', [userIds]);
  }

  if (organizationIds.length > 0) {
    await client.query('DELETE FROM "organization" WHERE "id" = ANY($1)', [
      organizationIds,
    ]);
  }

  if (userIds.length > 0) {
    await client.query('DELETE FROM "session" WHERE "user_id" = ANY($1)', [userIds]);
    await client.query('DELETE FROM "account" WHERE "user_id" = ANY($1)', [userIds]);
    await client.query('DELETE FROM "user" WHERE "id" = ANY($1)', [userIds]);
  }
}
