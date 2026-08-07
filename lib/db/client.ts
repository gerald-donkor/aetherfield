import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { databaseSchema } from "./database-schema";

/**
 * The application's database handle.
 *
 * Three constraints from AGENTS.md 7.3 shape this file, and each one is a
 * silent failure if it is dropped:
 *
 * 1. **The pool is built lazily.** `next build` evaluates top-level module
 *    code, so a pool constructed at import time against an unset
 *    `DATABASE_URL` fails the build before any route renders.
 * 2. **No `Proxy` wrapper.** The idiomatic-looking lazy `Proxy` breaks any
 *    library that inspects the adapter object — Better Auth (step 6) is
 *    exactly such a library, and its request chain hangs with no error. A
 *    plain `getDb()` over a module-level `let` is the sanctioned shape.
 * 3. **`DATABASE_URL` is the pooled URL** (PgBouncer, the `-pooler` host).
 *    Migrations use `DATABASE_URL_UNPOOLED` and read it from
 *    `drizzle.config.ts`; the app never touches the direct connection.
 *
 * The driver is `pg`, not `@neondatabase/serverless`: Fluid Compute keeps
 * instances warm long enough to reuse TCP connections, which is the case the
 * HTTP transport exists to work around (AGENTS.md 7.2).
 */

export type Db = NodePgDatabase<typeof databaseSchema>;

let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Pull it with `vercel env pull .env.local`.",
    );
  }

  const pool = new Pool({ connectionString });

  // Keeps the function instance alive long enough for idle connections to be
  // removed from the pool, and reuses connections across invocations.
  attachDatabasePool(pool);

  db = drizzle(pool, { schema: databaseSchema });
  return db;
}
