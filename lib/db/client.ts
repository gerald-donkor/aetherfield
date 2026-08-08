import "server-only";

import net from "node:net";

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
 * 4. **Node's happy-eyeballs budget is too tight for this host.** See
 *    `CONNECT_ATTEMPT_TIMEOUT_MS` below. Removing that call brings back an
 *    intermittent `ETIMEDOUT` that looks like the database being down.
 *
 * The driver is `pg`, not `@neondatabase/serverless`: Fluid Compute keeps
 * instances warm long enough to reuse TCP connections, which is the case the
 * HTTP transport exists to work around (AGENTS.md 7.2).
 */

/**
 * How long Node may spend on each address before abandoning it.
 *
 * `net.autoSelectFamily` is on by default and races the addresses a host
 * resolves to, giving each one `autoSelectFamilyAttemptTimeout` — **500 ms** on
 * node v26.5.1. The pooled Neon host resolves to **six** addresses (three A,
 * three AAAA), and the measured TCP connect to it is **319-410 ms**: inside the
 * budget, but only just. Any jitter pushes an attempt over, and when all six go
 * over Node reports one `AggregateError` of six `ETIMEDOUT`s — with no hint
 * that the connection was merely slow rather than refused.
 *
 * 2500 ms is a judgement on those measurements, not a measurement: roughly six
 * times the slowest attempt that did succeed, which leaves room for a developer
 * further from `us-east-1`. It costs nothing when a connect is healthy, because
 * the budget is a ceiling and not a wait.
 *
 * This is a process-wide default and so applies to every outbound socket the
 * server opens. That is acceptable here: the module is server-only, and a
 * connect that needs longer than half a second is normal for anything
 * cross-region.
 */
const CONNECT_ATTEMPT_TIMEOUT_MS = 2500;

/**
 * Ceiling on acquiring a connection from the pool. Above Neon's scale-to-zero
 * cold start, which AGENTS.md 7.3 puts at "a few hundred ms" and which measured
 * 3215 ms here for a cold connect plus one `select 1`. Also a judgement: it is
 * the point past which a request is better off failing visibly than hanging.
 */
const CONNECTION_TIMEOUT_MS = 10_000;

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

  // Guarded because the setter is a comparatively recent addition and this
  // module must not throw at pool construction on a runtime without it.
  if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
    net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  // Keeps the function instance alive long enough for idle connections to be
  // removed from the pool, and reuses connections across invocations.
  attachDatabasePool(pool);

  db = drizzle(pool, { schema: databaseSchema });
  return db;
}
