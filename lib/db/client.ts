import "server-only";

import net from "node:net";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { databaseSchema } from "./database-schema";
import { readDriverFault } from "./query-error";

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
 * 5. **The pool's `error` event must have a listener** and its lifetime
 *    settings must be chosen rather than inherited — prompt 83. Both are
 *    documented at their constants; the short version is that an unhandled
 *    `error` event takes the process down, and pg's 10 s idle default throws
 *    away the connection reuse constraint 3's driver was chosen for.
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
 * Ceiling on acquiring a connection from the pool — re-derived at prompt 83,
 * from these measurements against the pooled host from this machine, warm
 * compute, 15 Aug 2026:
 *
 * | fresh connection + `select 1` | slowest of the batch |
 * | --- | --- |
 * | 3 concurrent, warm | 2145 ms |
 * | 6 concurrent, warm | 2188 ms |
 * | 10 concurrent, warm | 3743 ms |
 * | 3 concurrent, across a scale-to-zero wake | 4118 ms |
 *
 * The last row is the re-measurement taken after this change and is the
 * slowest acquisition ever recorded against this host; prompt 37's cold connect
 * plus one `select 1` was 3215 ms.
 *
 * 7000 ms is a judgement on those, not a measurement: 1.7x the slowest observed
 * acquisition, warm or cold. It replaces an inherited 10000 that was never
 * derived, and which the failure this prompt investigated spent in full before
 * reporting a fault with no code on it. The bound that matters is the pair —
 * one timeout plus the single retry below is 14.1 s worst case, under the
 * 20.6 s the failing request took.
 */
const CONNECTION_TIMEOUT_MS = 7_000;

/**
 * How long an idle connection above `POOL_MIN` is kept.
 *
 * pg-pool defaults this to **10 s** (`node_modules/pg-pool/index.js:98-100`)
 * while a fresh connection to this host measures **~2.1 s**, so a developer
 * moving between pages a few seconds apart pays a full handshake on nearly
 * every render — which is precisely the reuse AGENTS.md 7.2 chose `pg` for.
 * 60 s is a judgement: long enough to span a page's fan-out and the navigation
 * after it, short enough that a burst's extra connections are not held against
 * Neon's connection budget for a whole session.
 *
 * Measured after the change, four `select 1`s twelve seconds apart — past the
 * old default, inside this one: **2051 / 388 / 284 / 409 ms**. Every render but
 * the first now skips the handshake.
 */
const IDLE_TIMEOUT_MS = 60_000;

/**
 * Connections kept regardless of idleness.
 *
 * pg-pool applies no idle timeout while `_clients.length <= min`
 * (`index.js:122-124, 409`), so `min: 1` is what makes the *first* query of a
 * request find a live connection instead of paying ~2.1 s. It does not
 * pre-connect — pg-pool creates clients on demand only — so this costs nothing
 * until the first query.
 */
const POOL_MIN = 1;

/**
 * Concurrent connections. pg-pool's own default, set here so it is a decision
 * rather than an inheritance: the widest fan-out in the app is three queries,
 * and Neon's pooled endpoint is sized well above ten.
 */
const POOL_MAX = 10;

/**
 * The age at which a connection is retired, whether or not it is idle.
 *
 * Neon suspends an idle compute after **5 minutes** on this plan
 * (AGENTS.md 7.3; the timeout is not disableable below Launch), and the
 * connection `POOL_MIN` holds open is exactly the one that can outlive the
 * server's own idea of it. 240 s is a judgement against that 5-minute cut: the
 * pool discards a connection a minute before Neon can, so a wake is paid on a
 * fresh connect rather than discovered on a dead one. Its cost is one extra
 * handshake per four minutes of continuous use.
 */
const MAX_LIFETIME_SECONDS = 240;

/**
 * How long to wait before the single acquisition retry below.
 *
 * A judgement, not a measurement: short enough to be invisible next to the
 * ~2.1 s a connect costs, long enough that a retry racing a compute wake does
 * not simply repeat the same instant.
 */
const ACQUIRE_RETRY_DELAY_MS = 100;

/**
 * A `Pool` that retries connection **acquisition** once.
 *
 * **Why this is safe, and why it is not a retry on queries.** `Pool#query`
 * (`node_modules/pg-pool/index.js:448-451`) calls `this.connect()` and returns
 * its error *before* dispatching anything, so every error `connect` reports is
 * one no statement outlived: nothing reached the server, and a second attempt
 * cannot repeat a write. That is what makes this scopeable to acquisition
 * without touching a single write path, which the prompt required before
 * allowing a retry at all. A retry one layer up — around a data-layer function
 * — would not be safe, because such a function may have completed one statement
 * before failing to acquire a connection for the next.
 *
 * **Why a subclass and not a wrapper.** AGENTS.md 7.5 forbids a `Proxy` around
 * the client because Better Auth inspects the adapter object and hangs with no
 * error. A subclass is a real `Pool` — `instanceof`, own methods, own event
 * emitter — so nothing that inspects it sees anything different.
 *
 * The retry calls `super.connect`, never `this.connect`, so a failing host
 * costs exactly two attempts and cannot recurse.
 */
class AcquisitionRetryingPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    if (!callback) {
      return new Promise<PoolClient>((resolve, reject) => {
        this.connect((error, client) => {
          if (error) reject(error);
          else if (client) resolve(client);
          else reject(new Error("Pool returned no client and no error"));
        });
      });
    }

    super.connect((error, client, done) => {
      if (!error) {
        callback(error, client, done);
        return;
      }

      // The fault, not the message: `readDriverFault` is the same allowlist the
      // data layer's sanitized errors use, so this line can never print a
      // connection string or a parameter (AGENTS.md 8.3 rule 2).
      const fault = readDriverFault(error);
      console.warn(
        "[db] connection acquisition failed; retrying once",
        fault ?? { name: "Error", code: undefined },
      );

      // Not `unref`ed: an unreferenced timer lets a process with nothing else
      // pending exit between the failure and the retry, which drops the retry
      // silently. Measured — the first draft did exactly that under `tsx`.
      setTimeout(() => super.connect(callback), ACQUIRE_RETRY_DELAY_MS);
    });
  }
}

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

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

  const pool = new AcquisitionRetryingPool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    min: POOL_MIN,
    max: POOL_MAX,
    maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
  });

  // An `EventEmitter` throws on an `error` it has no listener for, and
  // `pg-pool/index.js:52-62` emits one whenever an **idle** client fails — a
  // background disconnect from Neon, which happens routinely across a compute
  // suspend. Without this the dev server, or the function instance, dies on an
  // event the pool has already recovered from: it removed the client before
  // emitting. Logged as the fault and nothing else; never the error's message,
  // which on a connect failure can quote the host.
  pool.on("error", (error) => {
    console.error(
      "[db] idle client errored and was removed from the pool",
      readDriverFault(error) ?? { name: "Error", code: undefined },
    );
  });

  // Keeps the function instance alive long enough for idle connections to be
  // removed from the pool, and reuses connections across invocations.
  attachDatabasePool(pool);

  db = drizzle(pool, { schema: databaseSchema });
  return db;
}
