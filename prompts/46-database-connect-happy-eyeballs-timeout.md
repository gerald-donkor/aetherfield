# 46 — Fix the database connect timeout that breaks sign-in

## Scope, and why it is next

`POST /api/auth/sign-in/social` returns 500 on this machine. It is not an auth
bug: every database query from the dev server fails intermittently with

```
[cause]: AggregateError:
    code: 'ETIMEDOUT',
    [errors]: [ [Error], [Error], [Error], [Error], [Error], [Error] ]
```

Sign-in is merely the first surface that touches the database on every request —
Better Auth's `rateLimit.storage: "database"` (`lib/auth/server.ts`) reads
`rate_limit` before it does anything else, so the failing query in the log is
that read.

**Measured root cause** (measurements, not judgements — all four numbers below
were produced this session, none are eyeballed):

| measurement | value | how |
| --- | --- | --- |
| addresses `…-pooler.c-10.us-east-1.aws.neon.tech` resolves to | **6** (3× A, 3× AAAA) | `getent ahosts` |
| Node's default happy-eyeballs attempt budget | **500 ms** | `net.getDefaultAutoSelectFamilyAttemptTimeout()` on node v26.5.1 |
| real TCP connect RTT to the Neon proxy | **319 ms / 410 ms** on the two attempts that won | `net.connect` timing loop, 4 runs |
| the two attempts that lost | **1513 ms / 1516 ms**, `ETIMEDOUT` | same loop |

`autoSelectFamily` is on by default and gives **each** of the six addresses
500 ms. The genuine RTT from this network to `us-east-1` sits at 320–410 ms —
inside the budget, but only just — so any jitter pushes an attempt over, and when
all six go over Node aggregates them into one `ETIMEDOUT` with six inner errors.
That is precisely the shape in the terminal, and the ~1.5 s wall time of the
second failure in the log (`1735ms`) matches the 1513/1516 ms measured failures.

The `pg-connection-string` SSL deprecation warning in the same terminal output is
**unrelated noise** and is explicitly out of scope (see non-goals).

## Reference material read

- `lib/db/client.ts` — the lazy `getDb()` pool, its three documented constraints
- `lib/auth/server.ts` — `rateLimit: { enabled: true, storage: "database" }`
- `lib/db/auth-schema.ts:85` — `rateLimit` / `rate_limit`, the table in the log
- `node_modules/pg/lib/connection.js:19–44` — `config.stream` is honoured, but pg
  calls `stream.connect(port, host)` positionally, so per-socket `net.connect`
  options cannot be threaded through without subclassing `net.Socket`
- `node_modules/pg-pool/index.js:206–262` — `connectionTimeoutMillis` is honoured
  and defaults to off
- AGENTS.md §7.2 (driver is `pg`), §7.3 (lazy pool, no `Proxy`, pooled vs direct,
  scale-to-zero cold start is expected and not a bug to chase)

## The change

One file: `lib/db/client.ts`, inside `getDb()`, before the `Pool` is constructed.

1. Raise the process's happy-eyeballs attempt budget with
   `net.setDefaultAutoSelectFamilyAttemptTimeout(…)`. **Verified to exist on this
   Node** (`typeof === "function"`, node v26.5.1). Guard the call so an older or
   different runtime without it cannot throw at pool construction.
   The value must be justified against the measured 319–410 ms RTT with headroom
   for jitter and for a developer on a slower link — the prompt fixes it at
   **2500 ms**, which is ~6× the measured worst winning attempt. That number is a
   **judgement on a measurement**, and must be recorded as such.
2. Set an explicit `connectionTimeoutMillis` on the pool so a connect that is
   genuinely unreachable fails cleanly instead of hanging a request for as long
   as the socket layer allows. **10000 ms** — a judgement, chosen to sit above
   Neon's scale-to-zero cold start, which §7.3 says is "roughly a few hundred ms"
   and which was measured this session at **3215 ms** for a cold
   `connect` + `select 1` over the pooled URL.
3. Extend the file's existing numbered comment block with a fourth constraint
   explaining why the timeout override is there, so a later session does not
   delete it as unexplained. Match the surrounding comment voice.

Both values are per-process side effects of a server-only module and are
documented as such.

## Prerender impact

**none — no route changes.** `lib/db/client.ts` is `import "server-only"` and is
reached only from Server Actions and auth. Verify, do not assume: run
`npm run build` and confirm the route table still reads

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

with `/sign-in` and `/sign-up` unchanged from their current modes.

## Trust boundary

**none.** No request path is added, no input crosses from the browser, no
validation or authorisation changes. The change is transport configuration on an
outbound socket the server already opens.

## Secrets and data

Reads `DATABASE_URL` — already read by this exact line today, unchanged. No new
variable, nothing `NEXT_PUBLIC_*`, no personal data stored, logged or
transmitted. **Never log the connection string** while debugging this.

## Non-goals

- **The `pg-connection-string` SSL warning is not touched.** It is a deprecation
  notice about a future `pg` v9 default, not the failure, and changing `sslmode`
  on the Neon URL to silence it is a security-relevant edit that deserves its own
  decision. Say so in the record rather than fixing it silently.
- **Better Auth's `rateLimit.storage: "database"` is not changed.** Moving it to
  the already-provisioned Upstash limiter in `lib/rate-limit/` would remove a
  database round trip from the front of every auth request, and is a real
  improvement — but it is a design change to a shipped decision from build step
  6, not a fix for this bug, and the bug reproduces on every database query
  regardless. Flag it as a follow-up; do not do it here.
- No change to `drizzle.config.ts` or the migration path. `db:generate` /
  `db:migrate` run in their own short-lived processes over the **unpooled** URL
  and are not covered by this fix; if a migration later hits the same
  `ETIMEDOUT`, that is a separate, visible failure to handle then.
- No retry loop, no connection warming, no change to pool `max`.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run build`, and confirm the route table above
- A live reproduction: restart the dev server and exercise the Google button on
  `/sign-in`. Success is the redirect to Google's consent screen and **no**
  `ETIMEDOUT` in the terminal. Quote the terminal lines, both the request line
  and its status.

Report each command's actual output. Do not claim a check passed without it.

## Record it in

`docs/backend.md` — a short entry under the step 6 material: the measured cause
(the four numbers in the table above), the fix, the two chosen values marked as
judgements on those measurements, the SSL warning noted as deliberately
untouched, and the Upstash rate-limit-storage follow-up named.

If `docs/automation.md` does not already carry it, add the happy-eyeballs
timing loop as a recipe — it is a mechanical step that turned an opaque
`AggregateError` into a number, and a later session should start from the
command.

## SKILLS USED

- **`neon-postgres`** — pooled vs direct connections, driver behaviour, and
  scale-to-zero, to confirm the fix belongs at the socket layer and not in the
  connection string.
- **`vercel:vercel-storage`** — the Neon-on-Vercel pooling guidance that
  `lib/db/client.ts` was built from, so `attachDatabasePool` and the pool's
  lifetime are not disturbed.
- **`nextjs`** — confirm nothing about the server-only module's evaluation during
  `next build` changes when the pool gains options.
- **`better-auth-security-best-practices`** — read before deciding whether the
  rate-limit storage question belongs in this change; the conclusion recorded
  above is that it does not.
- **`drizzle-docs`** — only to confirm no schema or migration surface is touched.
