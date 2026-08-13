# 72 — Aligning the custom-factor form's fields across the two columns

## Scope, and why it is next

**Fix the misaligned controls on `/activity/factors`'s create form.** The user
reported it against a screenshot of the live page
(`/home/gdk26/Pictures/Screenshots/Screenshot_20260813_172045.png`): "make the
text boxes consistently aligned and inline".

It is next because it is a defect in a surface that shipped three prompts ago
(66, corrected by 67) and was extended by prompt 71 an hour ago. It is site
craft, not build sequence — §5.2's steps 1–14 are all committed, and this is the
kind of measured-surface correction the front matter treats as ordinary work.

## The failure, read out of the code

`FieldFrame` (`app/_components/primitives.tsx:224-268`) renders **label → hint →
control → error in normal flow**, inside a plain `<div className={className}>`.
The hint is `<p className="mt-1.5 font-serif text-[16px] text-muted">` at
`:252`, and it is conditional.

The create form lays its fields out in `md:grid-cols-2`
(`app/_components/activity/custom-factor-form.tsx`, the block opening
`className="mt-12 grid max-w-[980px] gap-6 md:grid-cols-2"`). A grid item's
content starts at the item's top edge, so **a field with a hint starts its
control one hint-height lower than the field beside it.**

Three rows in the screenshot show it, and each pairs a hinted field with an
unhinted one:

| left | right | which side has the hint |
| --- | --- | --- |
| Column text | Published unit | left |
| Published GHG unit | Value | right |
| Scope / Activity unit | — | neither; these already align |

The same root cause produces the second visible symptom: the row containing
`Value` is taller than the rows above it, so the gap before the `Scope` row reads
as inconsistent vertical rhythm rather than as the uniform `gap-6`.

**The two `SelectField` controls are not affected** — the form's local
`SelectField` (bottom of `custom-factor-form.tsx`) renders no hint at all, so
every select already starts at the same offset. Only `Field` is in scope.

## The decision this prompt is asking for

**Fix it locally on this form, not in `FieldFrame`.**

The obvious fix is to make `FieldFrame` a flex column and let the label/hint
group absorb the row's slack. It is also the wrong fix here, and the reason is
§8.1:

`<Field>` / `<TextareaField>` / `<FileField>` are consumed by sixteen modules,
and these among them render into **prerendered** routes —

```
app/design-system/page.tsx            /design-system        ○ Static
app/_components/auth/sign-in-form.tsx        /sign-in       ○ Static
app/_components/auth/sign-up-form.tsx        /sign-up       ○ Static
app/_components/auth/forgot-password-form.tsx /forgot-password ○ Static
app/_components/auth/reset-password-form.tsx  /reset-password  ○ Static
app/_components/auth/verify-email-result.tsx  /verify-email    ○ Static
app/_components/lead/demo-request-dialog.tsx  /  and /design-system
app/_components/newsletter/subscribe-dialog.tsx  /journal
app/_components/application/apply-dialog.tsx  /careers, /job-listing/[slug]
```

Changing the frame's markup or its class strings rewrites the prerendered HTML of
almost every static route on the site. `CONTROL_BASE`'s own comment
(`primitives.tsx:214-217`) records that sizing was deliberately kept out of it
"to keep `Field`'s emitted class string byte-identical to the one /sign-in and
/sign-up already prerender" — the same instinct applies to the frame.

`/activity/factors` is `ƒ Dynamic`. A fix scoped to it costs no prerendered byte
anywhere.

**The mechanism.** `Field` already forwards `className` onto the frame div
(`primitives.tsx:298`, `:244`). So the form passes, on the affected fields:

```
md:flex md:flex-col [&>input]:mt-auto
```

A grid item stretches to its row's height by default, and both controls are
`h-[52px]`, so pushing each control to the bottom of its item **bottom-aligns
them, which for equal-height controls is the same thing as top-aligning them.**
`md:` scopes it to the two-column breakpoint; below `md` the grid is one column
and there is nothing to align against.

Applied uniformly to every `Field` in the grid, not only the hinted ones — a
field that gains a hint later must not reintroduce the bug, and an item with no
slack is unaffected by `mt-auto`.

**The known limit, stated rather than hidden:** if exactly one field in a row
carries a validation error, that row's items differ in height below the control,
and the two controls in it will disagree while the error is on screen. That is a
transient state on the way to a corrected submission, against a permanent
misalignment on every render today. Closing it properly needs `grid-rows-subgrid`
over the whole form, which is a larger change to a settled layout and is a
non-goal here.

**Also in scope, same root cause:** the biogenic checkbox's `md:mt-[34px]` and
the two prose paragraphs' `md:mt-[30px]` (the set-description block, and prompt
71's supersession copy) are hand-tuned offsets that exist to fake the alignment
this change makes real. Re-derive each against the fixed layout rather than
leaving a magic number that now double-counts.

## Reference material to read at execution time

| path | for |
| --- | --- |
| `app/_components/primitives.tsx:210-268` | `CONTROL_BASE`, `FieldFrame`, and the byte-stability comment — **read before deciding to touch it** |
| `app/_components/primitives.tsx:274-364` | `Field` and `TextareaField`, and that both forward `className` to the frame |
| `app/_components/activity/custom-factor-form.tsx` | the three grid blocks, the local `SelectField`, and the hand-tuned `md:mt-*` offsets |
| `/home/gdk26/Pictures/Screenshots/Screenshot_20260813_172045.png` | the reported state, and the before half of the comparison |
| `docs/automation.md` | screenshotting the page, and the prerender-diff method |
| `docs/backend.md`, prompt 71's section | the supersession control this form gained an hour ago |

## Measurements this must hit

Produced by running the check, never eyeballed:

1. **Every control in a grid row starts at the same `y`.** Screenshot
   `/activity/factors` signed in as an owner at the same viewport as the report
   (1350 CSS px wide), and read the `getBoundingClientRect().top` of every
   `input` and `select` inside the three grid blocks. Report the values grouped
   by row; each row's two values must be equal. Report the before values from the
   same measurement run so the fix is a measured delta, not an assertion.
2. **The re-derived offsets are stated as measured or judged**, per the front
   matter, for each `md:mt-*` that changes.
3. **No other route's prerendered HTML moves** — the two-build diff below.

## Expected impact

**Prerender impact: none — and it must be verified, not assumed.**
`/activity/factors` is `ƒ Dynamic` and nothing else imports
`custom-factor-form.tsx`. If the implementation concludes `FieldFrame` must
change after all, **stop and ask** rather than accepting a site-wide HTML
rewrite: that is the §8.1 decision this prompt has deliberately declined to make
on the user's behalf.

Verify with the copy-tree two-build method in `docs/automation.md`
(`## Regenerating Better Auth's schema, and diffing a build against the parent`
and `### Three more prerender-diff traps, found at step 10`) — a `next dev` was
running at prompt 71 and probably still is, which is trap 3. Exclude `.claude/`
and `.agents/` on both sides, normalise `BUILD_ID` and both content-hashed chunk
patterns, strip `self.__next_f.push`, and compare the 21 files under
`.next/server/app/`. Expect **21 identical, 0 differing**, and quote the CSS
chunk's byte size on both sides.

**Trust boundary: none.** No request path changes. No action, no schema, no
query, no validation rule is touched — this is layout on an already-authorised,
already-rate-limited surface.

**Secrets and data: none.** No environment variable is read or added, no
`NEXT_PUBLIC_*`, no `.env.example` line, no personal data, no logging, no third
party, no model.

**No migration.** Nothing under `lib/db/` changes and `npm run db:generate` must
not be run.

## Non-goals

| not doing | why |
| --- | --- |
| changing `FieldFrame`, `Field`, `TextareaField`, `FileField` or `CONTROL_BASE` | §8.1 — it rewrites the prerendered HTML of `/`, `/journal`, `/careers`, `/design-system`, `/sign-in`, `/sign-up` and the rest. If it looks necessary, ask first |
| `grid-rows-subgrid` over the whole form | the complete fix for the one-error-in-a-row case, and a larger change to a settled layout than the reported defect warrants |
| restyling the form — spacing scale, field order, `max-w-[980px]`, the `gap-6` rhythm, the section headings | the report is about alignment, not about the design |
| the same treatment on the other twelve `Field` consumers | none was reported, and each carries its own prerender question |
| the local `SelectField` | it renders no hint, so its controls already align |
| `SiteNav`, `SiteFooter`, any marketing route, any GSAP surface | out of scope entirely, and settled |
| anything behind the form — the action, the schema, the queries, prompt 71's supersession behaviour | untouched |

## Checks to run

| check | note |
| --- | --- |
| `npm run lint` | |
| `npm run typecheck` | |
| `npm test` | unchanged by this work; quote file and test counts against 9 / 210 |
| `npm run build` | quote the route table; `/activity/factors` must stay `ƒ Dynamic` |
| prerender diff | the two-build method above; quote files compared / identical / differing and both CSS sizes |
| the alignment measurement | measurement 1, before and after |
| `npm run test:e2e` | Chromium and Firefox natively. **WebKit needs rootless Podman, which is not installed** — if it does not run, say so and do not report it as passed |

Report exact output for each (§2, §12 rule 3).

## Where the result is recorded

**A new `docs/` file is not warranted.** `/activity/factors` is a backend
surface and its record lives in `docs/backend.md`; add a short section
`## Aligning the custom-factor form's fields, prompt 72` after prompt 71's
section, carrying the root cause, why the fix is local rather than in
`FieldFrame`, the before/after offsets, the re-derived `md:mt-*` values marked
measured or judged, the stated one-error-per-row limit, and the checks table.

AGENTS.md needs **no** change: no index row, no site-wide invariant.

## SKILLS USED

| skill | for |
| --- | --- |
| `tailwind-4-docs` | `mt-auto` in a flex column, the `[&>input]:` arbitrary-variant syntax, and how a grid item's default `stretch` alignment interacts with both. **v4 is config-less — tokens live in `@theme` in `app/globals.css`** and this change must add none |
| `frontend-design:frontend-design` | judging the re-derived vertical offsets against the surface's existing rhythm, so the fix reads as deliberate rather than as a nudge |
| `nextjs` | confirming `/activity/factors` stays `ƒ Dynamic` and that no static route's render mode moves |
| `claude-in-chrome` | driving the signed-in page to screenshot it and to read the control offsets. Invoke the skill before any `mcp__claude-in-chrome__*` tool |

No GSAP skill: §7.5 forbids GSAP in backend UI and this adds none. No database,
validation or provider skill: nothing under `lib/` changes. No AI skill: §5.3
forbids a model call here.
