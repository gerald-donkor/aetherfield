# 104 — The allowlist checks membership, not attribution, and the docs imply otherwise

## Scope, and why it is next

Last of the three narrative prompts, and the only one in the entire sequence
whose deliverable is **honesty rather than code**. It follows 103 because 103
changes what the validator catches, and this prompt must describe the validator
as it stands after that change, not before.

`validateNarrative` in `lib/domain/reports.ts` checks that every numeric token
in the model's prose appears in the set of figures computed from the evidence.
That is a **membership** test. It is not an **attribution** test.

A model can therefore write a figure that is genuinely in the allowlist, against
the wrong label, and the validator accepts it:

> "Scope 3 emissions totalled 1,284.6 tCO2e"

— where `1,284.6` is real, computed, and is the **scope 1** total. Every token
passes. The sentence is false, and it is false in a regulatory filing.

The same holds for any figure attached to the wrong period, the wrong site, or
the wrong target.

**This is not a fixable defect and the prompt must not pretend to fix it.**
Deterministically verifying that a claim in prose attributes a number to the
right label is natural-language understanding, and §5.3 forbids using a model to
do it — a model checking a model is not a control. The mitigation that actually
works is already in the design: **nothing auto-publishes, the narrative is a
reviewed draft, and the export labels it "Narrative (draft)".**

The finding is that **the written record is stronger than the code.**
`docs/backend.md` presents the allowlist as *the* enforcement of §5.3's hard
rule. It is one of two controls, and the weaker one. A future session reading
the current text could reasonably conclude the review step is a formality and
remove it.

## Reference material read

- `lib/domain/reports.ts` — `validateNarrative` and the allowlist construction,
  read in full to confirm no attribution check exists anywhere in it
- `lib/reporting/narrative.ts` — `SYSTEM_PROMPT`, `buildNarrativePrompt`;
  `reportSections(evidence)` is the sole source of prompt figures
- `lib/domain/reports.ts` — `reportSections`, confirming label and value travel
  together into the prompt but not into the check
- `app/reports/[reportId]/export/route.ts` — the "Narrative (draft)" label
- `docs/backend.md`, step 13 — the claims this prompt corrects
- AGENTS.md §5.3 — the hard rule, "a suggestion with a confidence and a
  provenance", and "a report is a reviewed draft; nothing auto-publishes"

## What the implementation must do

**No behavioural change. This is a documentation and comment prompt.** If the
implementation finds itself editing validator logic, it has left scope — that
was 103.

1. **Correct `docs/backend.md`, step 13.** State plainly that the allowlist is a
   membership test; that it cannot detect a correct figure attached to a wrong
   label; that this is a deliberate limit rather than an oversight, because the
   deterministic alternative does not exist and a model-checks-model arrangement
   is forbidden by §5.3; and that **human review is the control that closes it.**
   Under §12 rule 8, if the current text asserts the allowlist *is* the
   enforcement, that line is corrected rather than left standing.

2. **Say the same thing in the code**, in `validateNarrative`'s docblock. The
   docs are where a session looks second; the function is where it looks first,
   and a reader who only opens the function must not come away believing the
   check is stronger than it is.

3. **Verify the mitigation is really in place** before citing it. Confirm there
   is no `published` state, that nothing transitions a narrative to a
   customer-visible artefact without a human action, and that the "(draft)"
   label is present on every rendering path — the page and the export both. If
   any path bypasses review, **that is a live §5.3 problem and it must be
   reported, not documented as safe** (§12 rule 9). This step is the reason the
   prompt is not purely clerical.

4. **Record the attribution limit where a reviewer will meet it.** A reviewer
   approving a draft should know what the machine did and did not check. If the
   review UI implies validation is comprehensive, note that as a follow-up
   finding for its own prompt — do **not** redesign the UI here.

## Measurements

None. Nothing is measured and nothing may be presented as measured. The claim
"the allowlist cannot detect misattribution" is established by reading the
function, and that is how it should be stated.

## Expected impact

**Zero at runtime.** Markdown and a docblock.

## Prerender impact

`none — no route changes`. Verify with `npm run build` and quote the route
table.

## Trust boundary

Unchanged, and described accurately for the first time: generate → truncate →
validate token membership → store `rejected` and discard on failure → **human
review** → nothing auto-publishes.

## Secrets and data

None read, none stored, none logged. No narrative text or tenant figure may
appear in the documentation as an example — **if an illustrative example is
wanted, invent one from obviously fictional numbers** and say it is fictional.

## Non-goals

- **Do not change `validateNarrative`'s behaviour.**
- **Do not attempt an attribution check.** See above; there is no deterministic
  one, and a model-based one is forbidden.
- Do not add a `published` state or change the draft lifecycle.
- Do not redesign the review UI.
- Do not touch `NUMBER_TOKEN` or the word list — that was 103.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

The checks are near-vacuous for a documentation change and that should be said
plainly in the report rather than presented as verification of anything (§12
rule 3). **The real check is step 3's verification of the review path**, and its
result is the finding this prompt actually produces.

## Where the result is recorded

`docs/backend.md`, step 13 — as the deliverable itself, not as an afterword.

## SKILLS USED

`None.` No installed skill covers this: the deliverable is an accurate
description of code already in the repository, and every fact in it is
established by reading `lib/domain/reports.ts`,
`app/reports/[reportId]/export/route.ts` and the report page. Stated explicitly
rather than omitted, per §4. In particular **`vercel:ai-sdk` is not installed**
and the AI surface is already resolved and verified — do not re-litigate it.
