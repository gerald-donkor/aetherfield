# 101 — 98 hand-written `"module.function"` strings in `withSafeQueryErrors`

## Scope, and why it is next

Third of the data-layer group. Last of the three because it is the widest
mechanical diff in `lib/db/` that is still in scope, and both 99 and 100 touch
files it would otherwise churn underneath.

`lib/db/query-error.ts:219` declares:

```ts
export function withSafeQueryErrors<A extends unknown[], R>(
  operation: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R>
```

`operation` is a free string, passed at **98 call sites** across `lib/db/`
(counted this session), each written by hand as `"<module>.<function>"` — for
example `withSafeQueryErrors("report-queries.createReport", …)` assigned to
`export const createReport`.

Nothing ties the string to either half of the name it repeats. Rename the
module, rename the exported const, or copy-paste a query as the basis for a new
one, and the operation label desyncs **silently**. It surfaces in error
reporting, which is precisely where a wrong label costs the most: the string is
the only handle an operator has on which query failed.

## Reference material read

- `lib/db/query-error.ts` — whole file: `withSafeQueryErrors`,
  `toSafeQueryError`, and what `operation` is actually used for
- `grep -rn "withSafeQueryErrors(" lib/db/` — all 98 sites and their naming
  convention
- `lib/db/report-queries.ts`, `lib/db/alert-queries.ts`,
  `lib/db/subscriber-queries.ts`, `lib/db/retention-queries.ts` — enough call
  sites to confirm the convention is uniform before mechanising it
- `docs/backend.md` — the step that introduced `query-error.ts`

## What the implementation must do

**First, read `toSafeQueryError` and establish where `operation` ends up.** If
it reaches a log line or an error report, §8.3 rule 2 is in play and the prompt
must confirm no personal data can ride along with it. Record the answer either
way.

Then reduce the hand-written surface. **Preferred shape: a per-module scope
factory**, so the module half is written once per file:

```ts
const safe = queryErrorScope("report-queries");
export const createReport = safe("createReport", async (…) => { … });
```

That removes 97 of the 98 module-name repetitions and leaves only the function
name, which now sits immediately beside the `const` it labels — close enough
that a rename that misses it is visible in the same line of diff.

**Investigate whether even the function half can be derived** before settling
for the factory. Check what `fn.name` yields for these call sites — most are
anonymous arrow functions passed inline, where it is empty, but verify rather
than assume (§12 rule 2). If a shape exists that derives the whole label safely
and without magic, prefer it. If not, the factory is the answer and the residual
hand-written function name is an accepted, recorded limitation.

**Do not change any emitted operation string.** Every one of the 98 labels must
come out byte-identical. That is the acceptance condition: the refactor is about
how the string is constructed, never about what it says. Verify it — a scripted
comparison of the 98 before-and-after labels is the right evidence, and is worth
adding to `docs/automation.md` if it is the kind of check a later session
repeats.

## Measurements

None. The 98 labels are the invariant, not a measurement.

## Expected impact

98 call sites shorten. Error labels identical. No behaviour change anywhere.

## Prerender impact

`none — no route changes`. `lib/db/` is `server-only`. Verify with
`npm run build` and quote the route table.

## Trust boundary

No request path changes. `withSafeQueryErrors` exists to stop a raw database
error reaching a caller; that behaviour is untouched and must be confirmed
untouched — the `try`/`catch`/`toSafeQueryError` body does not change.

## Secrets and data

Reads `DATABASE_URL` transitively. No new variable. **The one live question is
whether `operation` reaches a log**, answered in the first step above; if it
does, confirm it carries no row data, no email address and no id (§8.3 rule 2).

## Non-goals

- **Do not change any operation string's value.**
- **Do not change error-handling behaviour** — not the catch, not
  `toSafeQueryError`, not what callers receive.
- **Do not split any query module** while touching 98 sites across them.
- Do not add a lint rule in this prompt; if one would help, say so and let it be
  its own prompt.
- Do not touch the three `visible()` helpers (prompt 100) or the factor-scope
  joins (prompt 99).

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table
- The 98-label comparison described above — quote its result

## Where the result is recorded

`docs/backend.md`, in the section covering `lib/db/query-error.ts`. Record the
shape chosen, why the function half could or could not be derived, the label
comparison and its outcome, and the answer to the "does `operation` reach a log"
question. Add the comparison command to `docs/automation.md` if it is
repeatable.

## SKILLS USED

- `drizzle-docs` — the wrapped functions are Drizzle queries; confirm the
  wrapper's generic signature still infers their argument and return types
  through the added factory layer.
- `nextjs` — `server-only` boundaries, and that no new module escapes them.
