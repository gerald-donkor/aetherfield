import path from "node:path";

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

function connectionString(): string {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    try {
      process.loadEnvFile(path.join(__dirname, "..", "..", ".env.local"));
    } catch {
      /* Absent is not fatal here: the variable may already be exported. The
         error below is the one worth raising, and it names the key, never a
         value (AGENTS.md 8.4). */
    }
  }

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
