# 103 — The narrative allowlist only sees digits, and the prompt invites words

## Scope, and why it is next

The worst finding in the whole review, on either axis. It follows 102 because
102 fixes the truncation that would otherwise interact with any change here, and
it precedes 104 because 104 is documentation about the limit this prompt narrows.

`lib/domain/reports.ts:353`:

```ts
const NUMBER_TOKEN = /(?<![A-Za-z0-9.])\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9])/g;
```

It matches **digits only**. Every check built on it — the closed allowlist that
AGENTS.md §5.3 names as the enforcement of "an LLM never produces a number that
appears in a disclosure" — is therefore blind to a figure written in words.
"emissions fell by roughly a fifth", "around forty per cent of records",
"more than double the prior period" all pass unchecked.

**The system prompt actively invites exactly that phrasing.** Verified this
session, `lib/reporting/narrative.ts`, ABSOLUTE RULES:

> 3. If a figure you want to mention is not in the REPORT DATA, describe it in
>    words instead, or leave it out.

So the guardrail's blind spot and the instruction to walk into it are in the
same system. A model following rule 3 correctly produces an unvalidated
quantitative claim, and the allowlist reports success.

Neither the code nor `docs/backend.md` acknowledges this today.

## Reference material read

- `lib/domain/reports.ts:340-400` — `NUMBER_TOKEN`, `normaliseToken`,
  `addFigure`, `validateNarrative` and the allowlist construction
- `lib/domain/reports.test.ts` — the existing narrative validation tests
- `lib/reporting/narrative.ts` — `SYSTEM_PROMPT` in full, `buildNarrativePrompt`
- AGENTS.md §5.3 — the hard rule and the "suggestion with a confidence and a
  provenance" framing
- `docs/backend.md`, step 13 — what is currently claimed about the allowlist

## What the implementation must do

**This prompt must not overclaim a fix.** There is no regex that makes natural
language safe, and the honest deliverable is a materially narrowed gap plus a
written statement of what remains. Both halves are required.

1. **Change system prompt rule 3.** This is the highest-leverage edit and the
   cheapest. Rule 3 currently tells the model to substitute words for figures;
   it should tell it to **omit the claim entirely** rather than render it in
   words, and rule 4 should be extended to forbid quantitative claims in words
   as well as in digits — "a fifth", "double", "most", "the majority". Keep the
   register instruction intact.

2. **Extend detection to spelled-out quantities.** A closed list of English
   number words and quantifiers — cardinals, ordinals used as fractions
   (`a fifth`, `two thirds`), multipliers (`double`, `triple`, `twofold`), and
   vague quantifiers that carry a magnitude claim (`most`, `the majority`,
   `nearly all`). Detection here means **flag for review**, not silent
   acceptance and not automatic rejection: §5.3 requires a low-confidence result
   to be *surfaced*, never silently accepted.

3. **Decide and record the disposition.** If a spelled-out quantity is found,
   does the draft become `rejected`, or `needs_review`? Rejecting is safest and
   matches the existing binary; a third state is more honest but is a schema
   change and a UI change. **Recommend rejection for this prompt** and record
   the alternative as a considered option — do not quietly build a third state
   into a prompt scoped as a validator fix.

4. **Test it.** Domain tests in `lib/domain/reports.test.ts` for each category,
   plus the false-positive cases that matter: "Scope 1" and "scope 2" must not
   trip the ordinal detector, "a third party" must not read as the fraction, and
   the existing `tCO2e` / `kgCO2e` / `AR5` lookaround behaviour must be
   unchanged.

**Do not weaken the digit check** while extending it. Its lookarounds are
carefully argued in the existing docblock and the reasoning is correct.

## Measurements

None available. The false-positive and false-negative rates of the new detector
cannot be measured without a corpus of real narratives, and there is none —
step 13's flow has not run against real tenant data. **Every threshold and the
word list itself are judgements** and must be labelled as such (§12 rule 4).
Do not write "verified to catch spelled-out figures" for a list assembled by
hand.

## Expected impact

Some drafts that previously validated will now be rejected. That is the point,
and it is the correct direction of error for a disclosure document. Rejection
already stores `status: "rejected"` and discards the text, so no new failure
mode is introduced.

## Prerender impact

`none — no route changes`. Verify with `npm run build` and quote the route
table.

## Trust boundary

The model's output is the untrusted input. Unchanged in order: generate →
truncate → validate → store `rejected` and discard on failure. This prompt
widens what the validation catches. **The human reviewer remains the real
mitigation**, which is 104's subject.

## Secrets and data

No environment variable read or added. §5.3's AI Gateway / OIDC arrangement is
untouched — **no AI env var exists and none may be introduced**. Never log the
narrative text or any tenant figure (§8.3 rule 2).

## Non-goals

- **Do not use a model to check the model's output.** §5.3 forbids it in spirit
  and it is circular; the check stays deterministic and in `lib/domain/`.
- **Do not claim the gap is closed.** It is narrowed.
- Do not touch the truncation (102) or the attribution limit (104).
- Do not add a `needs_review` state, a schema change, or a migration — see
  point 3.
- Do not change the model, temperature, or `MAX_OUTPUT_TOKENS`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test` — quote the full output; the new domain tests are the primary
  evidence
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, step 13. Record the system-prompt change verbatim, the word
list and that it is a judgement, the disposition chosen and the alternative
considered, the false-positive cases tested, **and the residual gap in plain
terms** — that natural language cannot be fully validated by a token check and
human review is what closes it.

## SKILLS USED

- `zod-docs` — the validation result shape and how a new rejection reason
  surfaces through `lib/validation/reports.ts`.
- `nextjs` — the `lib/domain/` purity boundary (§6.2): the detector takes a
  string and returns a verdict, with no I/O.
- **Deliberately not `vercel:ai-sdk`.** AGENTS.md §5.3 records that it is not
  installed in this environment and that step 13's APIs were verified against
  live docs and `node_modules/`. The AI surface is resolved; do not re-litigate
  it. Nothing in this prompt changes the `generateText` call.
