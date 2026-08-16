# 93 — Reunite the invitation-write docblock with its constant

## Scope, and why it is next

Second of the five documentation-accuracy findings, grouped with 92 because the
whole group is comment-only and carries zero runtime risk. It is worth fixing
before any behavioural work because `lib/rate-limit/index.ts` is a file the
later security prompts (97, 98) both read, and a reader who trusts the current
layout will attribute the wrong reasoning to the wrong window.

In `lib/rate-limit/index.ts`, the docblock explaining the **invitation-write**
limiter (`/** Inviting, cancelling an invitation and removing a member, **keyed
by user id** — prompt 63 ... */`, ending at line 316) is immediately followed by
a *second* docblock — the organisation-deletion one — and then by
`ORGANIZATION_DELETION_LIMIT` / `ORGANIZATION_DELETION_WINDOW` at lines 337-338.

The constants it actually documents, `INVITATION_WRITE_LIMIT = 20` and
`INVITATION_WRITE_WINDOW = "1 h"`, sit **bare at lines 340-341**, with no
docblock above them.

So the file currently reads as though the invite-sends-mail-to-a-typed-address
reasoning and the "20 an hour bounds one compromised owner account" figure
belong to organisation deletion — which is documented as **10** an hour, for
entirely different reasons. Every other limiter in this file carries its
reasoning directly above its constant; this is the only one that does not.

Verified this session by reading `lib/rate-limit/index.ts:295-380`.

## Reference material read

- `lib/rate-limit/index.ts:295-380` — the two docblocks and the four constants
- `docs/backend.md` — build step 8's limiter reasoning, prompt 63 and prompt 73,
  which are the two prompts whose docblocks collided here

## What the implementation must do

Move the invitation-write docblock so it sits immediately above
`INVITATION_WRITE_LIMIT`. Leave the organisation-deletion docblock immediately
above `ORGANIZATION_DELETION_LIMIT`.

**Move the comment, do not rewrite it.** Both docblocks are correct prose about
correct numbers; the only defect is placement. A reworded justification is a new
judgement and would need its own reasoning under AGENTS.md §12 rule 4.

Preserve the file's existing ordering convention if the two pairs must swap
position to achieve this — say in the recorded result which way it was resolved.

## Measurements

None. **No limit value or window may change in this prompt.** `20`/`1 h` and
`10`/`1 h` are judgements already on record (§12 rule 4) and re-deciding them is
out of scope.

## Expected impact

**Zero.** Comments and declaration order within a module. Every limiter resolves
to the same numbers.

## Prerender impact

`none — no route changes`. `lib/rate-limit/` is `server-only` and reaches no
prerendered page. Verify with `npm run build` and quote the route table.

## Trust boundary

`none` — no request path changes. The limiters this file exports keep identical
behaviour; only which comment sits above which constant moves.

## Secrets and data

Reads no environment variable in this change. The module as a whole reads
`KV_REST_API_URL` / `KV_REST_API_TOKEN` lazily; that is untouched. No personal
data.

## Non-goals

- **Do not change any limit or window.** See Measurements.
- Do not consolidate the limiters, extract a factory, or reorder the file beyond
  what reuniting these two pairs requires.
- Do not touch the `CRON_SWEEP` docblock — that is prompt 94, deliberately
  separate so each finding gets its own commit.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, in the section covering the rate limiters (build step 8 /
prompts 63 and 73). One line noting the docblock was orphaned and reunited.

## SKILLS USED

- `upstash-ratelimit-js` — to confirm, before touching the file, that nothing
  about `Ratelimit`'s construction depends on declaration order of these
  constants, so "move the comment" really is inert.
