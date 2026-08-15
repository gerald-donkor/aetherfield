# 83 — Connection acquisition resilience, and a diagnosable failure

## Scope, and why it is next

`/activity/factors` rendered a `DatabaseQueryError` from
`emission-queries.listSupersedableRows` with `sqlState: undefined`, on a request
the dev server timed at **20.6s**. The three data-layer calls behind that page
all succeed when run directly, so the statement is not at fault: the failure is
in **acquiring a connection**, and `lib/db/client.ts` has three gaps that make it
both likely and undiagnosable.

This is not a new build step. It is a defect in step 1's data layer that every
phase-two page pays for, and it surfaced on the newest surface only because that
surface fans out to three queries at once.

## Reference material read

- `lib/db/client.ts` — the pool, its two named timeouts and their derivations
- `lib/db/query-error.ts` — `DatabaseQueryError`, `readSqlState`,
  `toSafeQueryError`, `withSafeQueryErrors`; the deliberate dropping of `cause`
- `lib/db/emission-queries.ts:804-850` — `listSupersedableRows` and its impl
- `app/activity/factors/page.tsx:29-33` — the `Promise.all` of three queries
- `node_modules/pg-pool/index.js:60-101` — pg 8.22.0 pool defaults and the
  `pool.emit('error', err, client)` call site
- `AGENTS.md` §7.2 (why `pg`, for connection reuse), §7.3 (Neon's two URLs,
  scale-to-zero), §8.3 rule 2 (never log a request body or personal data),
  §12 rules 4 and 7

## What was measured, and what is judged

**Measured**, against the pooled Neon host from this machine, warm compute,
15 Aug 2026 — quote these, do not re-derive them by eye:

| measurement | value |
| --- | --- |
| fresh connection + `select 1`, 3 concurrent | 1980 / 2137 / 2145 ms |
| the same, 6 concurrent | 2078-2188 ms |
| the same, 10 concurrent | 2058-3743 ms (slowest 3743) |
| pg 8.22.0 pool defaults | `max` 10, `min` 0, `idleTimeoutMillis` **10000** |
| a `connectionTimeoutMillis` expiry | `Error`, message `Connection terminated due to connection timeout`, **`code: undefined`** |
| the three page queries, run directly | 1 set / 10 factors / 9 supersedable rows, all OK |
| the failing request, from the user's terminal | 20.6s, `operation: 'emission-queries.listSupersedableRows'`, `sqlState: undefined`, `digest: '21027789'` |

**Judged, not measured**: that this particular failure was a connection-acquisition
timeout. Every observable is consistent with it — a codeless cause yields exactly
`sqlState: undefined`, and 20.6s is beyond the 10s ceiling — but the cause is
dropped by design, so it was never captured. **Task 1 below exists to turn this
judgement into a measurement**, and the record must keep saying "judged" until it
does.

Note the second-order finding, which is measured: `idleTimeoutMillis` defaults to
**10 s** while a fresh connection to this host costs **~2.1 s**. A pool with
`min: 0` therefore discards its connections between page loads in development,
so nearly every render pays a full handshake. AGENTS.md §7.2 chose `pg` over the
HTTP driver *for connection reuse*; the default undoes it.

## The work

**1. Make a connection failure diagnosable, without disclosing anything.**
`DatabaseQueryError` drops `cause` entirely (`lib/db/query-error.ts:47-51`), and
that decision is correct — `pg`'s `DatabaseError.detail` quotes conflicting key
values. But it also throws away the driver's *non-SQLSTATE* `code`
(`ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`) and the cause's constructor name,
neither of which can carry a row. Add a third own property alongside
`operation` and `sqlState` carrying only:

- the cause's `name`, and
- its `code` when it matches a **closed allowlist** of driver codes.

Never `message`, never `detail`, never `query`, never `params`. The existing
`readSqlState` try/except discipline applies unchanged — every property read
stays inside the `try`.

**2. Handle the pool's `error` event.** `lib/db/client.ts` attaches no
`pool.on("error")`. `pg-pool/index.js:62` emits it when an *idle* client fails,
and an `EventEmitter` `error` with no listener throws — a background Neon
disconnect can take the dev server down. Log the operation-free fact that an
idle client errored; log no connection string and no error message that could
embed one.

**3. Re-derive the two timeouts from the measurements above**, and record which
number is measured and which is judged, in the style `client.ts` already uses.
`CONNECTION_TIMEOUT_MS` is currently 10 s against a warm concurrent worst case of
3743 ms plus Neon's cold wake; decide it explicitly rather than inheriting it.

**4. Keep connections across renders.** Set `min` and `idleTimeoutMillis`
deliberately rather than taking pg's defaults, so the driver chosen for
connection reuse actually reuses connections. `maxLifetimeSeconds` should be
considered against Neon's own idle cut so the pool never hands out a connection
the server has already discarded.

**5. Retry once on a connection-acquisition failure — reads only.** A codeless
connection error is safely retryable; a statement that may have reached the
server is not. If this cannot be scoped to acquisition without touching the
write paths, **do not do it** — say so and leave it out rather than making
writes non-idempotent.

## Prerender impact

**none — no route changes.** This touches `lib/db/` only. The nine static routes
are unaffected, and no route's render mode changes. **Verify with
`npm run build`** and the route table, per AGENTS.md §8.1 — do not assume it.

## Trust boundary

**none.** No request path is added or changed. Nothing here parses input, and no
new value crosses from the browser. Task 1 changes only what an *already
sanitized* server-side error carries, and narrows toward disclosing less than the
raw `DrizzleQueryError` did.

## Secrets and data

Reads `DATABASE_URL` only, exactly as today; no new variable, and no
`NEXT_PUBLIC_*`. Stores nothing. **Logs nothing derived from a row, a parameter
or a connection string** — the allowlist in task 1 and the message discipline in
task 2 are what hold AGENTS.md §8.3 rule 2, and prompt 80's finding is the
reason both are written as allowlists rather than redactions.

## Non-goals

- **Not a change to any query.** `listSupersedableRows` is correct; it was the
  victim, not the cause.
- **Not a retry on writes** (see task 5).
- **Not a change to `app/activity/factors/page.tsx`.** Collapsing its three
  parallel queries into one round trip would mask this by reducing concurrency,
  and would leave every other fan-out page exposed.
- **Not `@neondatabase/serverless`.** AGENTS.md §7.2 settled the driver; a slow
  handshake is an argument for reusing connections, not for abandoning them.
- **Not a Neon plan change** to defeat scale-to-zero.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`, and confirm the route table in AGENTS.md §8.1 is unchanged
- Re-run the concurrency measurement above after the change and quote the new
  numbers

Record the result in **`docs/backend.md`**, under step 1's data-layer section —
the pool's settings, each one marked measured or judged, and the diagnosis of
this failure with its confidence stated honestly.

## SKILLS USED

- `neon-postgres` — pooled vs direct connections, scale-to-zero and cold-start
  behaviour, and what Neon's PgBouncer does to an idle connection
- `drizzle-docs` — `DrizzleQueryError`'s shape and what the node-postgres driver
  wrapper does and does not preserve
- `vercel:vercel-storage` — the Neon integration's connection guidance
- `vercel:vercel-functions` — Fluid Compute's instance reuse, which is the
  premise `attachDatabasePool` and the pool lifetime settings rest on
- `nextjs` — Next 16 request lifecycle and how a thrown server error reaches the
  dev overlay
