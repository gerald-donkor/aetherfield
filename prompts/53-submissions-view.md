# Build the authenticated submissions workspace

## Scope and why this is next

Implement build step 7: an authenticated Aetherfield staff workspace that reads
demo leads, newsletter subscribers and job applications; mints a short-lived
private CV URL only when an authorised person requests one; gives admins the
minimum controls needed to grant or revoke the `staff` role; and adds the
admin-only removal controls that the completed steps 2, 4 and 5 explicitly
deferred to step 7.

This is next because the repository and `git log`, not the prompt sequence,
show that every dependency is committed:

- `26ad46c` completed step 2's lead capture and write-path pattern;
- `9778e41` completed step 3's transactional-email foundation;
- `ff03de8` completed step 4's subscriber lifecycle;
- `5d3043c` completed step 5's private CV upload and applications;
- `ee27aed` completed step 6's Better Auth verification/reset foundation.

No `app/submissions/` route, submission-list query, signed CV reader or staff
management action exists. Step 7 is therefore the first unbuilt phase-one row
in `AGENTS.md` §5.2, and completing it closes phase one before any
organisation or tenant work begins.

This prompt is numbered 53 because 52 is the highest existing prompt number.
Prompt 51 and its Playwright setup are currently unrelated dirty working-tree
work. Preserve those changes exactly, do not absorb them into this prompt, and
stage only prompt-53-owned paths unless prompt 51 has been committed by the time
this prompt executes.

## Contract clarification requiring approval

`docs/backend.md` records three times that step 7 is where the real retention /
erasure control will land, but `AGENTS.md` §11.1 currently describes
`staff` as read/download-only and describes `admin` only as managing staff
accounts. Those statements leave no role authorised to operate the deferred
control.

The narrow resolution in this prompt is:

- `staff` remains read-only and may download CVs through short-lived signed
  links;
- `admin` may additionally grant/revoke the `staff` role and remove a lead,
  subscriber or application from the active submissions workspace;
- removal uses the existing `deleted_at` audit field; an application removal
  also deletes its private CV object and handles the cross-store failure path
  explicitly;
- no restore UI, bulk action, scheduled retention job or permanent row purge is
  added.

Approval of this prompt approves that minimal §11 clarification. Amend
the existing role row in `AGENTS.md` in place during implementation so the
contract and code do not disagree; record the detailed implementation only in
`docs/backend.md`.

## Reference material read

- `AGENTS.md`, especially workflow and prompt rules in §§1-4; build step 7 in
  §5.2; the Server Component, action, data, storage and auth boundaries in §6;
  provider traps in §7.3; static-site, personal-data and secret rules in §8;
  soft deletion in §9; protected mutations in §10; staff/admin authority in
  §11; and the verification rules in §12.
- `docs/backend.md`: step 1's exact phase-one columns/indexes and mandatory
  `deleted_at is null` read filter; step 6's `getCurrentAccount()` and role
  re-read; steps 2, 4 and 5's current query modules, personal-data policy and
  deferred removal controls; and the installed `@vercel/blob` 2.7.0 record.
- `docs/automation.md` for isolated production servers, clean parent-build
  comparisons, prerendered-HTML normalisation, Playwright state, and synthetic
  database/blob cleanup. Re-read it before any build comparison, browser run or
  provider-backed verification.
- `lib/auth/server.ts`, `lib/db/auth-queries.ts`,
  `lib/db/{lead,subscriber,application}-queries.ts`, `lib/db/schema.ts`,
  `lib/storage/cv.ts`, `app/account/page.tsx`, `proxy.ts`, the shared
  primitives, `app/_components/auth/auth-shell.tsx`, and
  `app/_components/home/dashboard.tsx`.
- `prompts/38-auth-sign-in-and-sign-up.md`,
  `prompts/47-newsletter-double-opt-in.md`,
  `prompts/48-job-applications-and-blob-upload.md`, and
  `prompts/52-email-verification-and-password-reset.md` as historical scope
  evidence only, never as proof that work exists.
- Installed Next.js 16.2 docs in `node_modules/next/dist/docs/`: the `page`
  convention (async `params` / `searchParams`), Server Component ORM reads,
  dynamic request APIs, redirects, caching, and the experimental
  `forbidden()` / `unauthorized()` requirement. `authInterrupts` is not enabled,
  so this prompt does not introduce those experimental APIs.
- Installed `@vercel/blob` 2.7.0 declarations. They verify the current
  `issueSignedToken()` plus `presignUrl()` flow, pathname/operation scoping,
  absolute `validUntil`, private GET access and `useCache` option. The old
  `getDownloadUrl()` helper is not a private authorisation mechanism.
- The local Tailwind 4 snapshot dated 7 Aug 2026, including its engineering
  playbook, responsive utilities and overflow guidance. No comp, screenshot or
  recording defines this workspace; the visual constraints below come from the
  existing tokens, primitives and page gutters, and are judgements rather than
  comp measurements.

## SKILLS USED

- `nextjs` - build request-time Server Component routes with async route props,
  direct server reads, safe redirects, loading/error boundaries, and no
  internal Route Handler.
- `next-cache-components` - keep session-bound personal data uncached and avoid
  introducing `use cache`, `unstable_cache`, cache tags or stale cross-user
  output; Cache Components remains disabled.
- `routing-middleware` - extend the existing Next.js 16 `proxy.ts` matcher only
  to `/submissions/:path*`, preserving its optimistic-only role.
- `tailwind-4-docs` - compose the responsive workspace from existing v4 tokens
  and primitives without a config file or second design system.
- `vercel-react-best-practices` - parallelise independent server reads, keep
  browser code to the admin action controls, and avoid serialising unnecessary
  personal data to client components.
- `drizzle-docs` - implement partial selects, `deleted_at is null` filters,
  deterministic newest-first ordering, count/limit/offset pagination, guarded
  role updates and soft-delete/compensation queries using verified PostgreSQL
  APIs.
- `zod-docs` - validate query-string view/page values, dynamic application ids,
  admin role inputs and removal ids with Zod 4's verified APIs.
- `neon` - preserve the existing provisioned Lakebase Postgres resource and
  recognise that no new Neon primitive or branch is needed.
- `neon-postgres` - keep application reads on the pooled `pg` connection and
  the no-migration guard on the direct connection workflow.
- `better-auth-best-practices` - reuse the installed server session API and
  existing Better Auth user records without adding a provider, plugin or root
  client provider.
- `better-auth-security-best-practices` - re-read roles from Postgres for every
  protected request/action and preserve origin, session and cookie controls.
- `vercel-storage` - mint narrowly scoped private Blob GET URLs and delete CV
  objects without exposing the read-write token or falling back to public
  access.

Email, Resend, React Email, Upstash, GSAP, organisation, marketplace and
design-handoff skills are deliberately not used: this step sends no email,
adds no public write path, animation, provider resource, tenant model or comp.

## Implementation requirements

1. Re-read this approved prompt and load every skill in `SKILLS USED` before
   editing implementation files. Re-check `git status`, the highest prompt
   number, the repository and recent `git log`. Preserve unrelated dirty work,
   especially prompt 51's Playwright files.

2. Add a server-only authorisation helper on top of the existing
   `getCurrentAccount()` path rather than trusting a cookie, proxy result or
   session-carried role. Every protected page and action must re-read the role
   from Postgres:

   - no session -> redirect to `/sign-in` with the exact requested
     `/submissions...` callback;
   - authenticated account with no `staff`/`admin` role -> redirect to
     `/account` without querying any submission table or Blob;
   - `staff` and `admin` -> submissions reads and CV download are allowed;
   - admin-only actions must check `role === "admin"` again inside the action.

   Do not enable experimental `authInterrupts`, add a root provider, use
   `getSessionCookie()` as authority, or place a database call in `proxy.ts`.

3. Extend `proxy.ts`'s positive matcher from `/account` to exactly `/account`
   and `/submissions/:path*`. It remains an optimistic missing-cookie redirect
   only. Unmatched marketing pages must continue to skip proxy invocation.

4. Extend the existing query modules rather than creating a second module that
   also owns the same table:

   - `lead-queries.ts`: list/count live leads and admin-only soft-delete by id;
   - `subscriber-queries.ts`: list/count live subscribers and admin-only
     soft-delete by id, never selecting either token;
   - `application-queries.ts`: list/count live applications, fetch one live
     application's CV pathname/filename by id for an authorised download, and
     guarded soft-delete/restore helpers for removal compensation;
   - `auth-queries.ts`: list/count verified user accounts for the admin staff
     view and guarded grant/revoke of `staff` only.

   All list reads must use partial selects, filter `deleted_at is null`, order
   by `created_at desc, id desc` for a deterministic newest-first result, and
   use a shared page size of **20**. Twenty is a product judgement, not a
   measurement: it keeps a personal-data page readable and bounds each server
   response while all three phase-one tables remain small. Implement
   count/limit/offset pagination with the verified Drizzle APIs; do not fetch
   all rows and paginate in React.

5. A list result may contain only what its view renders:

   - leads: id, name, work email, company, optional message, source, created;
   - subscribers: id, email, status and lifecycle timestamps;
   - applications: id, job slug, name, email, optional message, original
     sanitised CV filename and created time;
   - staff administration: user id, name, email, verified state, current role
     and created time.

   Never select subscriber tokens into the route, never select application
   `cv_pathname` into the list, never pass a whole Drizzle row to a client
   component, and never log an address, name, message, filename, pathname or
   query result.

6. Add `lib/validation/submissions.ts`, deliberately browser-safe and importing
   nothing from `lib/db/`. Define one Zod contract for:

   - `view`: `leads | subscribers | applications | staff`, defaulting safely to
     `leads`; `staff` is still authorised separately and never becomes a role
     check by parsing;
   - `page`: a positive integer with a bounded representation; invalid,
     repeated or out-of-range input normalises to page 1 rather than reaching
     `.offset()` unchecked;
   - submission/application/user ids: UUIDs;
   - staff mutation role: `staff | none`, where `none` maps to database `null`.

   The public form rule about one schema running twice does not apply to these
   server-rendered navigation values, but every browser-controlled value must
   still be parsed before it influences a query or mutation.

7. Build `/submissions` as a dynamic Server Component workspace with one
   request-time route and URL-driven navigation:

   - an Aetherfield page shell using the existing `SiteNav`, `SiteFooter`,
     `max-w-page`, 20px/24px gutters, fonts, colours, borders and button/link
     primitives;
   - a calm eyebrow/title/introduction identifying the view as operational
     submissions, not a product dashboard;
   - navigation links for Leads, Subscribers and Applications; show Staff only
     to admins;
   - exactly one dataset queried and rendered per request, driven by
     `?view=<view>&page=<n>`; do not fetch all four tabs speculatively;
   - count and page rows started together with `Promise.all()` after
     authorisation and parsing;
   - a truthful empty state for every view;
   - Previous/Next links that preserve the view, never create page 0, and do
     not expose a stale page past the final page;
   - semantic headings, lists/definition lists or tables with real headers,
     keyboard-visible focus, and messages that wrap rather than clip.

   Use a mobile-first card/definition layout and a denser aligned layout at
   desktop. Do not solve mobile by forcing the entire page into a horizontal
   scroller. Long addresses, filenames, companies and messages must wrap; the
   settled nav/footer and the deliberate overflow invariants for site marks
   remain untouched.

8. Add an on-demand CV route at
   `/submissions/applications/[id]/cv`. It is a Server Component read path, not
   an internal API Route Handler:

   - await and validate `params.id` with the shared UUID schema;
   - perform the authoritative staff/admin check before the application query;
   - query one live application and only then read its private pathname;
   - unknown/removed/invalid ids produce the route's safe not-found state;
   - call a new server-only `createCvReadUrl()` in `lib/storage/cv.ts` that uses
     the installed `issueSignedToken()` and `presignUrl()` API, scoped to that
     exact pathname and the `get` operation, `access: "private"`, and
     `useCache: false`;
   - set both delegation and URL expiry to **five minutes**. Five minutes is a
     security/usability judgement, not a measurement: it is enough for one
     browser handoff while sharply limiting reuse;
   - redirect to the returned URL outside any catch that would swallow Next's
     redirect control flow.

   Do not use `getDownloadUrl()` as authority, do not store or cache the signed
   URL, do not mint URLs for every row while rendering the list, do not expose
   `BLOB_READ_WRITE_TOKEN`, and do not log the destination or pathname. The
   visible link label uses the stored original filename; do not invent content
   disposition behaviour the installed API does not provide.

9. Implement minimal admin staff management in the `staff` view:

   - list verified accounts with pagination; customer accounts remain `role`
     null and do not gain access by appearing in the list;
   - a narrow client leaf may receive only id, display name and current
     staff/null state for each control; keep email and all other account data in
     server-rendered markup;
   - a colocated `app/submissions/actions.ts` Server Action validates id and
     `staff | none`, then authorises the current account as admin before calling
     the query layer;
   - the input can grant or revoke `staff` only. It cannot create `admin`,
     change another admin, change the acting admin, mutate an unverified user,
     or accept an arbitrary string;
   - return the repository's typed handled-result vocabulary, announce success
     and failure, manage focus, and refresh/revalidate only the submissions
     view after a successful change. Never return a raw database/provider
     error.

   The first admin remains an explicit database bootstrap operation; do not add
   a public bootstrap route, secret URL, default admin, email allowlist or
   self-promotion path.

10. Implement admin-only removal controls for live leads, subscribers and
    applications in the same action module. Every action validates the entity
    kind/id, re-authorises admin, and calls only the owning query/storage layer.

    - leads/subscribers: set `deleted_at` once; already removed/unknown is a
      handled non-disclosing outcome;
    - applications: mark the row removed, delete the private CV with a strict
      deletion helper that reports failure without logging personal data, and
      compensate by restoring `deleted_at` if Blob deletion fails so an admin
      can retry rather than silently leaving the UI claiming erasure;
    - no physical row deletion, bulk removal, restore UI or scheduled cleanup;
    - controls must require an explicit confirmation state in the client leaf,
      be keyboard operable, announce results, and never rely on colour alone.

    Preserve `deleteCv()`'s existing best-effort/non-throwing contract for the
    application write path. Add a separate strict helper for this admin flow
    rather than changing stage-e compensation semantics underneath step 5.

11. Add `loading.tsx`, `error.tsx` and a local not-found experience only where
    they materially improve the new protected route. The error boundary must be
    a narrow client component with safe copy and retry, and must never print the
    error object or personal data. Loading/empty/error states reuse the same
    page geometry so navigation does not jump. Do not add global error/auth
    files or change marketing-page fallbacks.

12. Add a staff/admin link from the existing dynamic `/account` page to
    `/submissions`. Customer accounts with no staff role retain the existing
    account content and see no link. This is discoverability only; it is not
    enforcement.

13. Do not add or change a database column, enum, index or migration. The
    existing indexes and `deleted_at` columns were created for this step.
    `npm run db:generate` must report no schema changes. Do not add a provider,
    environment-variable name, cache, REST endpoint, analytics event, email,
    notification, export, search, sort menu, bulk action or phase-two tenant
    concept.

14. Update `AGENTS.md` only for the approved §11 admin capability
    clarification described above. Update `docs/backend.md` after
    implementation with a new `## Step 7 — authenticated submissions` section
    covering the exact query/result fields, pagination judgement, routes,
    authorisation matrix, role-management guards, signed-URL API/TTL, removal
    and compensation flow, data/secrets, route table, prerender comparison,
    runtime checks and any deviation. Do not edit historical prompt files.

15. Commit the completed prompt-53 implementation to `main` without prompting
    and do not push. Stage only prompt-53-owned paths. If prompt 51 remains
    dirty, leave it unstaged and report that explicitly.

## Measurements and acceptance criteria

There is no comp-derived geometry. Visual values are inherited from existing
tokens/primitives and judged against the established account/auth surfaces.
Acceptance is structural, behavioural and security-focused:

- unauthenticated `/submissions` and CV requests redirect to sign-in with the
  requested callback; a forged cookie still fails the page's database-backed
  check;
- a verified customer with role null cannot query submissions, mint a CV URL,
  see staff management or invoke admin actions;
- staff can view paginated live leads/subscribers/applications and request one
  five-minute private CV URL, but cannot view the staff tab or mutate roles /
  submissions;
- admin can do everything staff can, grant/revoke staff under the stated
  guards, and remove live submissions with accessible handled results;
- subscriber confirmation/unsubscribe tokens and application blob pathnames
  never appear in rendered list HTML, client props, logs or stored browser
  state;
- every list is newest-first, deterministic, limited to 20 rows, count-backed,
  and filters soft-deleted rows;
- invalid/repeated view/page/id/role input never reaches a query unchecked and
  never produces an unhandled error;
- a CV URL is generated only after session, role, UUID and live-row checks; it
  is exact-path GET-only, private, uncached, five-minute and never persisted;
- removing an application removes it from reads and deletes the private blob;
  a simulated Blob failure restores visibility and returns a retryable error;
- no auth/provider configuration, database schema, public write path, root
  provider or marketing-page markup changes.

## Prerender impact

- `/submissions` is a new dynamic route because it reads `headers()` through
  the authoritative session path, parses request-time `searchParams`, and reads
  fresh personal data.
- `/submissions/applications/[id]/cv` is a new dynamic redirect route because
  it authorises per request and mints a per-request private URL.
- `/account` remains dynamic; staff/admin accounts gain one conditional link.
- `proxy.ts` gains only the positive `/submissions/:path*` matcher.
- `/`, `/about`, `/careers`, `/design-system`, `/journal`, `/sign-in`,
  `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`, all six
  article routes, all three job-listing routes, and both newsletter pages must
  retain their existing render modes and byte-equivalent prerendered HTML after
  the documented normalisation. `SiteNav` and `SiteFooter` class strings,
  geometry and markup remain settled.

Verify this from a clean parent build and the production route table using
`docs/automation.md`. Do not infer it from the new route being isolated.

## Trust boundary

Browser-controlled values are the `/submissions` view/page query, application
id route segment, and admin action entity/user ids plus desired staff/null
state. Zod validates each before it influences a query. Validation never grants
authority.

The authoritative boundary is `getCurrentAccount()` plus the per-request role
re-read in Postgres. Reads require `staff | admin`; staff management and
submission removal require `admin` again inside the action. The proxy cookie
check and hidden controls are presentation only. Query modules parameterise all
values through Drizzle and filter removed rows.

Rejected page reads redirect before data access. Invalid or unknown CV ids
produce safe not-found output. Admin mutations return typed handled outcomes,
never thrown strings or raw errors. A forged request cannot ask for `admin`,
target an admin/self/unverified account, or operate a submission as staff.

## Secrets and data

The change reads existing server-only variables only:

- `DATABASE_URL` through the existing pooled lazy `pg` client;
- Better Auth's existing server secret/base URL through session resolution;
- `BLOB_READ_WRITE_TOKEN` through the Blob SDK for signed-token issuance and
  strict deletion.

No new variable and no `NEXT_PUBLIC_*` value is added. The direct database URL
remains migration/check-only.

Rendered only to authorised staff/admin: names, emails, companies, messages,
lead source, subscriber state/timestamps, job slug, original CV filename and
created times. Admin additionally sees verified account identity and role.
Subscriber tokens, password/auth records, CV pathnames, Blob credentials and
signed URLs are not serialised into list client props. The browser necessarily
receives the one signed URL it requested after the redirect; it expires in five
minutes and is not stored by application code.

Removal writes `deleted_at`; application removal also deletes the Blob object.
No personal value enters application logs, test output, docs or commit text.
The existing unresolved finite-retention-window question remains unresolved:
this prompt adds a manual control, not a policy or scheduled purge, and the
documentation must say so.

## Non-goals

- No phase-two organisations, memberships, tenant scope, ingestion,
  calculations, forecasts, dashboard, reporting or AI.
- No public admin API, generic CMS/admin framework, component library, second
  design system, analytics dashboard, charts, CSV export, search, arbitrary
  sorting, saved filters, bulk actions or notifications.
- No email send, Resend change, newsletter issue tooling, Blob upload change,
  auth provider/plugin, BotID/Upstash change or new environment variable.
- No public role assignment, admin creation, admin demotion/promotion UI or
  account deletion. The first admin remains a manual trusted bootstrap.
- No `use cache`, client-side data-fetching library, internal Route Handler,
  root auth provider or database query outside `lib/db/`.
- No restyle of `SiteNav`, `SiteFooter`, marketing pages or existing auth
  shell; no GSAP or other animation.
- No scheduled retention policy or claim that soft deletion is physical data
  erasure. No permanent database-row purge or restore UI.
- Do not modify, stage or commit prompt 51's unrelated Playwright setup as part
  of prompt 53.

## Checks to run

Run and quote exact output; never report a pass without executing it:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`, including the full relevant route table.
4. An env-less `npm run build` using `docs/automation.md`'s safe
   move/restore procedure, proving auth/database/Blob construction stays lazy.
5. `npm run db:generate` as a no-schema-change guard. It must produce no
   migration; do not keep an empty or unrelated migration.
6. A clean parent-build prerender comparison per **Prerender impact**, keeping
   prompt 51's unrelated dirty work out of both sides.
7. If prompt 51 is committed and `npm run test:e2e` exists in the clean
   repository at execution time, add focused protected-route coverage and run
   it across the configured projects. If it remains unrelated dirty work, do
   not edit or cite it as prompt-53 evidence.
8. Against an isolated production server with real Development env, exercise
   unauthenticated, forged-cookie, customer, staff and admin accounts. Verify
   the access matrix, query/tab pagination, empty states, invalid/repeated
   query values, admin role guards, focused announcements and customer account
   regression. Do not print identities or credentials.
9. Seed synthetic lead/subscriber/application rows and one private synthetic
   PDF without logging their personal fields. Verify newest-first ordering,
   page boundaries, status/timestamp rendering, token/pathname absence from
   HTML and client payload, signed CV redirect/access, private raw-URL denial,
   and five-minute signing metadata.
10. Exercise removal for all three entity types, including already-removed /
    unknown outcomes and an induced Blob-delete failure that proves the
    application compensation path. Verify staff cannot invoke any removal.
11. Inspect application/server output for personal data, raw query results,
    blob pathnames, signed URLs and secrets. Inspect staged content for
    connection-string/token patterns.
12. Delete every synthetic auth record, submission and Blob created by checks,
    then query/list by opaque test ids to prove cleanup without printing
    personal fields.

Finally update `docs/backend.md`, apply the approved §11 contract
clarification, commit only the completed prompt-53 work to `main`, share exact
reproduction steps, and do not push.
