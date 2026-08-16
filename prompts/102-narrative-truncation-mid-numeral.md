# 102 — The narrative truncation can cut a figure in half

## Scope, and why it is next

First of three prompts on the AI narrative guardrail (102, 103, 104). It goes
first because it is the only one of the three that is a code defect rather than
a documentation-honesty problem, and because it is the cheapest to close.

`lib/reporting/narrative.ts:193`:

```ts
return { ok: true, text: text.slice(0, NARRATIVE_MAX_CHARS), model: NARRATIVE_MODEL };
```

`NARRATIVE_MAX_CHARS` is `6_000` (`lib/validation/reports.ts:73`). The slice is a
raw character cut with no regard for what sits at the boundary, so a model
response longer than 6,000 characters can be truncated **mid-numeral** —
`1,234.5 tCO2e` becoming `1,23`.

AGENTS.md §5.3's hard rule is that an LLM never produces a number that appears
in a disclosure, and the allowlist check is what enforces it. A truncated
numeral is a number that **no computed figure produced**, manufactured by our own
code after the model returned.

**It is currently safe, and the prompt must be honest that it is.** The
allowlist validation runs downstream of the slice, and `1,23` is not in the
allowed set, so the draft is rejected and stored as `status: "rejected"`. Safe —
but safe **by accident of ordering**, not by design. Reverse the two steps, or
add any path that stores the text before validating, and a fabricated figure
reaches a disclosure draft. Nothing in the file says the ordering is
load-bearing.

There is also an ordinary quality cost even when it works: a report whose only
defect is 6,000 characters of length gets rejected wholesale for a broken
numeral rather than ending cleanly.

## Reference material read

- `lib/reporting/narrative.ts` — whole file; the `generateText` call, the empty
  check, the slice, `MAX_OUTPUT_TOKENS`
- `lib/validation/reports.ts:73` — `NARRATIVE_MAX_CHARS = 6_000`
- `lib/domain/reports.ts` — `validateNarrative`, `NUMBER_TOKEN`, the allowlist
- `lib/domain/reports.test.ts:475` — the existing `validateNarrative` test that
  passes `NARRATIVE_MAX_CHARS`
- `docs/backend.md`, step 13 — the narrative's recorded design

## What the implementation must do

**First, verify the ordering claim.** Trace every path from `narrative.ts`'s
return to storage and confirm `validateNarrative` runs on the sliced text in all
of them. If any path stores unvalidated text, **that is a far more serious
finding — stop and report it** (§12 rule 9) rather than folding it into this
prompt.

Then make the truncation safe by construction:

- Truncate on a boundary that cannot fall inside a figure. A sentence or
  whitespace boundary at or before the limit is the obvious candidate; a
  numeral-aware backstop is the minimum.
- The result must still be `≤ NARRATIVE_MAX_CHARS`.
- Handle the degenerate case — 6,000 characters with no boundary — explicitly,
  and say what it does.
- **Where the boundary logic goes matters.** If it is pure — and it should be —
  §6.2 puts it in `lib/domain/`, where it is independently testable and where
  `validateNarrative` already lives. It takes a string and a limit and does no
  I/O.
- **Add domain tests** in `lib/domain/reports.test.ts`: a figure straddling the
  boundary, a figure ending exactly on it, no-boundary-found, and text under the
  limit passing through untouched.

Finally, **write down that the ordering is load-bearing** — a comment at the
truncation site and at the validation site saying each depends on the other's
position. That is what stops a future reordering reintroducing this.

## Measurements

`NARRATIVE_MAX_CHARS = 6_000` is **unchanged**; it is an existing judgement
(§12 rule 4) and re-deciding it is out of scope. Any figure the implementation
introduces — a lookback window for the boundary search, say — is a judgement
too, and must be labelled as one.

## Expected impact

Long narratives end on a clean boundary instead of mid-word or mid-numeral.
Drafts that would previously have been rejected for a broken figure now validate
on their merits. **No change for any narrative under 6,000 characters**, which
is expected to be nearly all of them — state that expectation as the judgement
it is.

## Prerender impact

`none — no route changes`. The narrative path is authenticated and behind
`/reports`. Verify with `npm run build` and quote the route table.

## Trust boundary

The model's output is the untrusted input here, and this prompt hardens our
handling of it. The chain is unchanged in order: generate → truncate → validate
against the closed allowlist → store `rejected` and discard the text on failure.
Nothing auto-publishes; §5.3's "reviewed draft" contract stands.

## Secrets and data

No environment variable is read by this change. The AI Gateway path uses the
project's Vercel-managed OIDC token and **no AI env var exists** (§5.3) — do not
introduce one. **Never log the narrative text**: it is generated over a
customer's computed figures and is commercial data (§8.3's reasoning, extended
by §5.3).

## Non-goals

- **Do not change `NARRATIVE_MAX_CHARS`, `MAX_OUTPUT_TOKENS`, the model, the
  temperature, or the system prompt.**
- **Do not change the allowlist or `NUMBER_TOKEN`** — that is prompt 103.
- Do not add a retry, a repair pass, or a "ask the model to shorten it" loop.
- Do not let the model near the truncation decision. §5.3: deterministic code
  only.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test` — quote the full output; the new domain tests are the primary
  evidence for this prompt
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, step 13. Record the boundary rule chosen, the degenerate
case's behaviour, the new tests, the outcome of the ordering verification, and
that the ordering is now documented as load-bearing at both sites.

## SKILLS USED

- `zod-docs` — `NARRATIVE_MAX_CHARS` lives in `lib/validation/reports.ts` beside
  the schemas; confirm nothing in the schema layer also enforces the length in a
  way that would double-truncate.
- `nextjs` — where the truncation runs relative to the Server Action and the
  `lib/domain/` purity boundary (§6.2).
