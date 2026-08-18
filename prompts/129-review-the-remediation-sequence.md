# 129 — Review the remediation sequence, on both axes

## Scope, and why it is next

**Both ordered sequences in `AGENTS.md` are complete.** Resolved from the
repository and `git log`, never from `prompts/` (§12 rule 5):

- **§5.2's build sequence, steps 1–14** — every step's work is on disk.
  `app/{dashboard,targets,reports,submissions,activity}` exist, `lib/domain/`
  carries thirteen modules with their tests, `lib/reporting/narrative.ts` is
  step 13's one model call, and `vercel.json` declares step 14's three cron
  entries with `maxDuration: 300`.
- **§5.4's remediation, candidates 1–6** — landed as `622c6b2` (1), `3ac8c64`
  (3), `4be68c8` + `557f6f1` (2), `44f6666` (4), `af77a82` (5), `15de360` (6).
  `docs/architecture.md:1330` states it in its own words: *"Candidate 6 was the
  last one … the architecture review of 17 Aug 2026 is fully remediated."*
- `e6eb810` (prompt 128) then closed the WebKit gap that prompts 121–127 each
  recorded as infrastructure they did not own, and the three-engine matrix ran
  green for the first time in fourteen prompts.

So there is no next unbuilt step, and §1's resolution procedure reached its
rule 5 — the remaining open items were named to the user and one was chosen.
**The user chose a fresh review pass** over the eight commits since the last
review, using two skills they named by path. Three other open items were
offered and **not** chosen; they are recorded under *Non-goals* below so a later
session does not have to re-derive them.

**Why a review is the right next move on the evidence, not just the chosen
one.** The last full-project review ran on 2026-08-17 **at `2337ab1`**, which is
the commit immediately *before* the remediation sequence began. Every one of the
six candidates therefore landed **after** the only review this codebase has had,
and they are not small: `3,328` insertions against `3,108` deletions across 59
code files, concentrated in the shared write path — one tenant gate
(`lib/auth/tenant.ts`), one lifecycle module adopted by 24 client leaves
(`app/_components/use-write.ts`), one policy table replacing twenty wrappers
(`lib/rate-limit/policies.ts`), one boundary shell for eight files
(`app/_components/workspace-boundary.tsx`), and `app/activity/actions.ts` cut
from 1,512 lines into three modules. That is the largest unreviewed surface the
project has ever carried, and it is the surface §10's write-path contract runs
through.

## The fixed point, verified before anything is spawned

The `code-review` skill's step 1 requires the fixed point to resolve and the
diff to be non-empty **before** sub-agents start, so a bad ref fails here rather
than inside two parallel agents. Both were confirmed while writing this prompt
and must be re-confirmed at execution:

```
$ git rev-parse 2337ab1
2337ab15a0210c03e0f665a57b5b2e9d4da1c48b

$ git log 2337ab1..HEAD --oneline
e6eb810 Give the lifecycle projects a browser the WebKit image carries
15de360 One workspace boundary shell for the eight loading/error copies
af77a82 Twenty rate-limit wrappers become one policy table
44f6666 Cut app/activity/actions.ts along its three routes
557f6f1 Adopt the submit lifecycle module on the three marketing dialogs
4be68c8 The submit lifecycle is a module, not a habit (workspace half)
3ac8c64 Collapse the tenant resolve and the limiter into one gate
622c6b2 Map a ZodError once, and record the remediation sequence

$ git diff 2337ab1...HEAD --stat | tail -1
71 files changed, 7310 insertions(+), 3112 deletions(-)
```

**The diff command is `git diff 2337ab1...HEAD` — three dots**, per the skill's
step 1, so the comparison is against the merge-base. Capture it once and hand
the same string to both sub-agents; do not let an agent invent its own range.

`2337ab1` is chosen because it is exactly where the last review stopped. Nothing
between it and `HEAD` has been reviewed, and nothing before it is re-reviewed —
that ground was covered on 2026-08-17 and its findings were fixed in the same
pass (`docs/backend.md:14165`).

## Reference material read for this prompt, by path

- `.agents/skills/code-review/SKILL.md` — read in full (87 lines): the two axes,
  the parallel-sub-agent requirement, the twelve-smell baseline, the
  "repo overrides / always a judgement call" rules, the 400-word cap on each
  agent's report, and step 5's prohibition on merging or reranking the axes
- `.agents/skills/improve-codebase-architecture/SKILL.md` — read in full
  (71 lines): the YAGNI scoping rule that weights recently-changed paths, the
  deletion test, the HTML report contract, and the instruction **not** to
  propose interfaces before the user picks a candidate
- `.agents/skills/improve-codebase-architecture/HTML-REPORT.md` — the scaffold,
  the card fields, the badge vocabulary and the diagram guidance
- `AGENTS.md` — front matter (invariants, bundle rule, GSAP discipline), §5.2,
  §5.4, §6.2, §6.3, §8.1–§8.4, §9.2, §10, §11.2, §12
- `docs/architecture.md` — the six candidates (lines 46–220), the order and its
  constraints (221–249), and all seven landed prompt records (250–1335)
- `docs/backend.md:14165–14269` — the 2026-08-17 review, what it fixed and the
  four items it deliberately left recorded
- `prompts/104-allowlist-attribution-limit.md` — read because the narrative
  allowlist's attribution hole looks like a finding and **is not one**
- `docs/skills.md` — the ownership test, and what is installed

## Two adaptations both skills require, because their assumed files do not exist

Neither is a workaround; each is a substitution of a **stronger** source this
repository actually has, and both must be stated in the final report rather than
applied silently (§12 rule 8).

**1. `code-review` step 2 — the spec source.** The skill looks for issue
references and `docs/agents/issue-tracker.md`, then says to tell the user to run
`/setup-matt-pocock-skills`. **Do not say that.** `docs/agents/` does not exist,
this project has no issue tracker, and its commits carry no `#123` references —
but it has something better and the skill's own step 2.3 allows it (*"a spec
file under `docs/`"*). The spec for this diff is, in this order:

| commit | its spec |
| --- | --- |
| all eight | `AGENTS.md` §5.4's candidate table and its stated order `1 → 3 → 2 → 4, 5, 6` |
| all eight | `docs/architecture.md` lines 46–249 — each candidate's problem, solution, stated cost and dependency |
| each individually | `prompts/121`–`128`, the file re-read verbatim at that commit's execution time |

The Spec agent gets all three, and its brief is unchanged: what the spec asked
for and is missing or partial, what is in the diff that no spec asked for, and
what looks implemented but wrong — **quoting the spec line for each finding**.

**2. `improve-codebase-architecture` — `CONTEXT.md` and `docs/adr/` are both
absent.** The skill leans on them for domain vocabulary and for decisions it
must not re-litigate. Substitute, and say so in the report:

- **Domain glossary** → `AGENTS.md` §5 (the product and the four-verb loop) and
  §9 (the entities). The nouns are *lead*, *subscriber*, *application*,
  *organisation*, *member*, *activity record*, *emission factor*, *factor set*,
  *factor mapping*, *target*, *report*, *alert*. Use these, per the skill's
  line 54 — not "the FooBarHandler" and not "the Order service".
- **ADR equivalents, not to be re-litigated** → `AGENTS.md` §6.2's hard
  boundaries, §7.2's provider choices, §7.5's do-not-use list, §9.2's rules,
  and every landed record in `docs/architecture.md`. Three specific decisions a
  naive scan will re-suggest and must not:
  - **the narrative allowlist is a membership test, not an attribution test** —
    prompt 104 settled this deliberately (*"This is not a fixable defect and the
    prompt must not pretend to fix it"*); it is not a candidate
  - **`lib/validation/` is deliberately not `server-only`** and must not import
    from `lib/db/` (§6.3) — a scan that "tightens" it breaks §10 rule 1
  - **the eight boundary files did not get shorter** — candidate 6 landed at
    exactly 189 lines before and after, and `docs/architecture.md` explains why
    that is the correct outcome; line count is not the measure

**3. Three skills `improve-codebase-architecture` calls for are not installed.**
Checked, not assumed: `codebase-design`, `grilling` and `domain-modeling` are
absent from `.agents/skills/`, `.claude/skills/` and `~/.claude/skills/`. This
is a real gap and is reported, not routed around (§12 rule 9):

- The **architecture vocabulary** the skill demands — *module*, *interface*,
  *depth*, *seam*, *adapter*, *leverage*, *locality*, the deletion test, "the
  interface is the test surface", "one adapter = hypothetical seam, two = real"
  — is enumerated in `SKILL.md` line 13 itself, so **the vocabulary survives
  without the skill** and must still be used exactly.
- What does **not** survive is `codebase-design`'s design-it-twice parallel
  pattern and `grilling`'s decision tree. **Stop at the end of step 2** — the
  report plus "Which of these would you like to explore?" — and tell the user
  plainly that the grilling loop cannot run here. Do not improvise a substitute
  and present it as the skill's step 3.

## What the implementation does

### Phase A — `code-review`, both axes

Follow `.agents/skills/code-review/SKILL.md` exactly, with the step-2
substitution above.

1. Re-confirm the fixed point resolves and the diff is non-empty.
2. **Spawn the two sub-agents in parallel, in one message.** The skill's whole
   design is that the axes do not pollute each other's context; running them
   sequentially, or merging them into one agent, defeats it. *(Sub-agents are
   used here because both named skills mandate them — this is the user's
   instruction, not an unprompted fan-out.)*
3. The **Standards** agent gets: the diff command, the commit list, the
   standards sources, and **the twelve-smell baseline pasted in full** — the
   skill is explicit that the sub-agent has no other access to it. The standards
   sources are `AGENTS.md` in full (there is no `CODING_STANDARDS.md` or
   `CONTRIBUTING.md`; `AGENTS.md` is this repo's documented standard and is far
   more specific than either) plus the `docs/` file owning each touched area.
   Its brief must keep the skill's distinction: **documented-standard breaches
   can be hard violations; baseline smells are always judgement calls; a
   documented repo standard overrides the baseline; skip what tooling already
   enforces** (`lint` and `typecheck` both run clean, so anything they catch is
   not a finding).
4. The **Spec** agent gets the three spec sources tabled above.
5. Both report **under 400 words**. Aggregate under `## Standards` and `## Spec`
   headings, **verbatim or lightly cleaned**. Per step 5, do **not** merge or
   rerank across axes, and per step 6's summary rule, give a per-axis count and
   the worst issue *within* each axis — **never a single winner across axes**.

**Fixing.** Match the 2026-08-17 precedent recorded at `docs/backend.md:14165`:
fix, in the same pass, every **hard violation** and **documented-standard
breach**, plus judgement calls cheap enough to close without a redesign.
Anything needing a redesign is **recorded as a finding, not half-fixed** — it
becomes its own prompt. If a finding turns out to be a documented deliberate
limit (as prompt 104's is), say so and close it rather than "fixing" it.

### Phase B — `improve-codebase-architecture`

Only after Phase A's findings are settled, so the deepening scan sees the fixed
tree rather than a stale one.

Follow `.agents/skills/improve-codebase-architecture/SKILL.md`, with the
substitutions above. Its **step 1 YAGNI rule decides the scope**: weight the
recently-changed paths. The hot spots are already measured — the write path the
six candidates rewrote, led by `lib/auth/tenant.ts`, `app/_components/use-write.ts`,
`lib/rate-limit/policies.ts`, the three `app/activity/*/actions.ts` modules and
`lib/validation/result.ts`. Spawn **one** explore sub-agent, per the skill.

Apply the **deletion test** to anything suspected shallow — *would deleting it
concentrate complexity, or merely move it?* A "concentrates" is the signal.
Six modules were just created by the remediation; this is precisely the moment
to ask whether each earned its interface, and a candidate that says *one of the
six is shallow* is a legitimate finding, not a criticism of a landed prompt.

The report is a **self-contained HTML file written outside the repository** —
`$TMPDIR`, falling back to `/tmp`, named
`architecture-review-<timestamp>.html`. It uses Tailwind and Mermaid via CDN;
that is the skill's scaffold and it is **not** a §7.5 "second design system"
violation, because the file never enters this repository and is never committed.
Give the user the **absolute path** in the reply. `xdg-open` may open nothing
useful from a background job — the path is the deliverable, not the window.

**Stop after the report and the question.** Propose no interfaces, and write no
code for any candidate (skill line 60).

## Measurements this prompt must produce, and how

No number here is eyeballed; each has a procedure.

| measurement | procedure |
| --- | --- |
| fixed point resolves | `git rev-parse 2337ab1`, quoted |
| commits under review | `git log 2337ab1..HEAD --oneline`, quoted in full |
| diff size | `git diff 2337ab1...HEAD --stat \| tail -1`, quoted |
| findings per axis | the two agents' own counts, reported separately and never summed |
| findings fixed vs. recorded | an explicit table — every finding is one or the other, none unaccounted for |
| deepening candidates | count, each with its `Strong` / `Worth exploring` / `Speculative` badge |
| prerender impact | `docs/automation.md`'s clean two-build diff — **only if Phase A fixes anything**; see below |

## Prerender impact

**`none — no route changes` is the expected answer, and it must be verified, not
assumed** (§4, §8.1).

A review that finds nothing changes no file and the question does not arise.
**If Phase A fixes anything**, the fix decides it, and the rule is §8.1's: a
prompt that alters a prerendered page's markup or render mode has exceeded its
scope unless it was declared up front. **This prompt declares that it must
not.** So:

- If every fix is in `lib/` or in a server module, run the build and confirm the
  route table matches §8.1 — `/ /_not-found /about /careers /design-system
  /forgot-password /journal /reset-password /sign-in /sign-up /verify-email` as
  `○`, `/article/[slug]` (6) and `/job-listing/[slug]` (3) as `●`, the workspace
  routes `ƒ`.
- If any fix touches a client leaf under `app/_components/` that a prerendered
  page renders — the three marketing dialogs are exactly this — run the full
  two-build prerender diff from `docs/automation.md` and report **21 of 21**
  byte-identical, normalising `BUILD_ID` and both chunk-name patterns.
  **Remeasure the CSS byte count; never carry prompt 124's or 127's figure
  forward.**
- The standing warning holds: **never quote a bare page-wide
  `magick compare -metric AE`** for `/`, `/journal` or `/careers`.

## Trust boundary

**No new request path, and no change to an existing one** — a review adds
nothing that crosses from the browser to the server.

If Phase A fixes anything on the write path, the boundary is §10's and is
unchanged in shape: BotID, then the rate limit, then the shared Zod parse, then
authorisation, then the write — **stages a, b, c in that order**. A fix may not
reorder them, may not weaken `lib/auth/tenant.ts`'s membership re-read, and may
not turn a typed result into a thrown error. Any fix touching an action must
leave the action returning `{ ok: true } | { ok: false, error, fieldErrors? }`.

## Secrets and data

**No environment variable is read, added or changed**, no `.env.example` change,
no `NEXT_PUBLIC_*`, and no model call — the AI surfaces in §5.3 are not touched
and Phase A/B are both static analysis.

Two data rules bind the **reports themselves**, because both skills produce
prose that quotes source:

- **Never quote a real secret, session token, email address or connection
  string** into a finding, the HTML report, or the `docs/` record (§8.3, and the
  prompt-78 incident recorded at `docs/backend.md:7752`). Quote code, not values.
- The HTML report lands in `$TMPDIR` and **is not committed**. Confirm with
  `git status` before the commit that no `.html` file entered the tree.

## Non-goals — what this prompt deliberately does not do

- **No new feature.** §5.2's "do not overbuild" is unchanged by the sequence
  being complete. The three open items the user was offered and did not choose
  stay unbuilt, and are recorded here so a later session finds them without
  re-deriving them:
  1. **A Resend sending domain** — `docs/backend.md:13204` calls it *"the real
     blocker on customer-facing email"*; blocked externally, since
     `vercel domains ls` reports 0 and §7.4's procedure needs a domain the
     project owns.
  2. **The `nav` demo CTA** — `lib/db/schema.ts:79` declares `lead_source` as
     `["hero", "nav", "cta_band"]` and **nothing writes `nav`**; building it
     touches `SiteNav`, a settled surface.
  3. **Un-retiring a target** — `docs/backend.md:10242` records it as *"a real
     gap for a later prompt to weigh, not silently filled."*
- **No re-review of anything at or before `2337ab1`.** That was reviewed on
  2026-08-17 and fixed in the same pass.
- **No re-litigating a landed candidate.** The six are closed. A candidate may
  be found *shallow* by Phase B — that is a new proposal, not a reopening.
- **No redesign inside this prompt.** Phase B stops at the report and the
  question; a chosen candidate becomes prompt 130.
- **No `ReportFindings` tool call.** This skill's step 5 specifies markdown
  under two headings, and the tool's own contract is to be used only when the
  active review instructions ask for it. They do not.
- **No `npx skills update`** to try to fetch the three missing skills — see
  `docs/skills.md`'s warning at the bottom of that file. The gap is reported.
- **No GSAP anywhere** (§7.5), and no change to `SiteFooter` or `SiteNav`.

## Checks to run

| check | expected |
| --- | --- |
| `npm run lint` | clean — quote the output |
| `npm run typecheck` | clean — quote the output |
| `npm test` | **318 passed, 13 files** is the current baseline (prompts 124/127); any change to it is a finding to explain, not a number to update silently |
| `npm run build` | exit 0, route table matching §8.1 |
| prerender diff | per *Prerender impact* above — skipped, with the reason stated, only if no file changed |
| `npm run test:e2e` | the full matrix. Prompt 128 made WebKit runnable — **Chromium + Firefox 110 passed / 12 skipped, then WebKit 50 passed / 12 skipped** is the baseline it measured. Run it **only if Phase A changed a file**; if nothing changed, say so rather than reporting a run that proves nothing |
| `git status` | no `.html` report file in the tree |

Every one of these is quoted from its own output. **Never claim a check passed
without running it** (§2, §12 rule 3).

## Where the result is recorded

**`docs/architecture.md`**, as one new dated section appended after the
prompt-127 record — that file owns reviews of this codebase's architecture and
already carries the 17 Aug 2026 review's candidates and their remediation. It
must contain:

1. the fixed point, the commit list and the diff size, as quoted output;
2. the two axes' reports, **kept separate**, with a per-axis count;
3. the fixed-vs-recorded table, with nothing unaccounted for;
4. the deepening candidates with their badges, and the top recommendation;
5. **the three adaptations** — the spec-source substitution, the
   `CONTEXT.md`/ADR substitution, and the three missing skills — stated as
   deviations from what each skill assumes;
6. every check's real output.

Add **one cross-reference line** at `docs/backend.md`'s 2026-08-17 review
section pointing forward to it, so a session reading the older record learns a
later pass exists. That is the only edit to `docs/backend.md`.

**Nothing is added to `AGENTS.md`** — no index row is needed, since
`docs/architecture.md` is already indexed, and no new site-wide invariant meets
the front matter's cap rule. If Phase A finds `AGENTS.md` itself stale — as the
2026-08-17 review did, when §6.3's directory map was missing `lib/reporting/` —
that line is corrected in the same change (§12 rule 8), and that is a
correction, not growth.

Finish with §1 step 9 (how to re-run the review) and step 10 (**commit to
`main`, unprompted; do not push**).

## SKILLS USED

Both are invoked by the implementation, not merely listed — §4's manifest rule.
The first two are the user's explicit instruction, named by path.

| skill | what it is for |
| --- | --- |
| `code-review` | Phase A. The two-axis review, its parallel sub-agents, the twelve-smell baseline and the no-reranking aggregation rule |
| `improve-codebase-architecture` | Phase B. The deepening scan, the deletion test, and the HTML report — stopping at the report and its question |
| `nextjs` | any finding touching App Router structure, Server Actions, route handlers, `proxy.ts` or render modes — Next 16.2 contradicts most tutorials (§7.3) |
| `zod-docs` | `lib/validation/result.ts` and `use-write.ts`'s structural `Issues` type are candidate 1 and 2's core; a finding about either needs the real `safeParse` union shape |
| `drizzle-docs` | any finding in `lib/db/` or reaching `DrizzleQueryError`'s surface |
| `better-auth-best-practices` | `lib/auth/tenant.ts` is candidate 3's whole subject; session and membership resolution |
| `better-auth-security-best-practices` | the same file on the authorisation axis — §11.2 says the role is re-read per request, never trusted from the session payload |
| `upstash-ratelimit-js` | `lib/rate-limit/policies.ts` is candidate 5's whole subject — verify the limiter's real API before any finding about the policy table |
| `tailwind-4-docs` | only if a finding touches a class string; v4 is config-less and `@theme` in `app/globals.css` is the token source |
| `vercel-functions` | if a finding touches the cron routes' `maxDuration` or the Fluid Compute assumptions in §7.1 |

`codebase-design`, `grilling` and `domain-modeling` are **called for by
`improve-codebase-architecture` and are not installed** — checked, and reported
above rather than substituted for.
