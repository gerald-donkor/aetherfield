# 106 — `NETWORK_ERROR` is declared in sixteen files, with two different texts

## Scope, and why it is next

Follows 105 because both touch the same twenty client leaves and 105's diff is
the larger one; doing this first would churn it.

`const NETWORK_ERROR` is declared in **sixteen** files under `app/_components/`,
verified this session:

`activity/factor-import-form.tsx:65`, `activity/factor-set-form.tsx:47`,
`activity/mapping-form.tsx:35`, `activity/import-controls.tsx:23`,
`activity/custom-factor-form.tsx:82`, `activity/upload-form.tsx:36`,
`activity/recalculate-control.tsx:23`, `targets/create-target-form.tsx:19`,
`targets/retire-target-control.tsx:8`, `reports/create-report-form.tsx:30`,
`reports/report-controls.tsx:23`, `organization/members-panel.tsx:45`,
`organization/delete-organization-panel.tsx:42`,
`organization/create-organization-form.tsx:42`,
`organization/invitation-response.tsx:26`,
`alerts/alert-preference-control.tsx:27`.

**And the text is not the same in all sixteen.** At least two variants exist:

- `"We couldn't reach the server. Please try again."`
- `"We couldn't reach the server. Check your connection and try again."`

So the copy a user sees for an identical failure depends on which control they
were using. AGENTS.md's content conventions and the site's measured, operational
register both argue for one sentence, chosen once.

## Reference material read

- The sixteen declarations above, each read to capture its exact text
- `grep -rn "NETWORK_ERROR" app/ lib/` — including the seventeenth site the
  review reported as an inlined literal rather than a named constant; **confirm
  whether that site exists** before citing it, and if it does not, say so (§12
  rule 1 cuts both ways)
- `lib/validation/result.ts` — `SubmitResult`, to see where shared user-facing
  strings already live, if anywhere
- AGENTS.md §6.3 — `lib/validation/` is deliberately **not** `server-only`, and
  is the one module client leaves and actions share

## What the implementation must do

1. **Collect every variant's exact text** and list them in the recorded result.
   The count of distinct strings is the finding's real size and the review did
   not establish it.
2. **Choose one sentence.** This is a copy decision, not a mechanical one. The
   register is measured and operational (§5): state plainly what happened and
   what to do. The longer variant tells the user something actionable
   ("Check your connection"); the shorter does not. Recommend the more useful
   one and say why.
3. **Put it in one place and import it.** The natural home is beside the shared
   validation surface — but **`lib/validation/` must stay free of anything that
   reads a secret and must not import from `lib/db/`** (§6.3), and a plain
   string constant satisfies both. Verify the chosen module is already imported
   by client leaves without pulling anything unwanted into a bundle.
4. Replace all sixteen (or seventeen) declarations with the import.

**Any site whose current text is deliberately different must keep its
difference** — check each for a docblock or comment justifying it before
flattening. If none has one, say so; that is itself the evidence that the
divergence was accidental.

## Measurements

None. The choice of sentence is a **judgement** and must be labelled as one
(§12 rule 4). No measurement of user comprehension exists.

## Expected impact

Some controls' network-failure message changes text. That is a user-visible copy
change on authenticated pages, it is intentional, and it must be listed
explicitly in the recorded result rather than described as a no-op refactor.

## Prerender impact

`none — no route changes` **expected** — every one of the sixteen files is an
authenticated-area component. **Verify it**, because the new home for the
constant may be a module the marketing routes already import: `npm run build`,
confirm the nine routes' modes, and if the constant lands anywhere reachable
from a prerendered page, diff that page's HTML per `docs/automation.md`.

## Trust boundary

`none` — a client-side fallback string shown when the Server Action call itself
throws (a fetch failure), not a validation result. No server behaviour changes.
Note that the action's own typed `{ ok: false, error }` path is untouched; this
constant only covers the `catch`.

## Secrets and data

None. A static string. No logging is added, and the `catch` blocks must keep
logging nothing (§8.3 rule 2).

## Non-goals

- **Do not touch `FormStatus`** — prompt 105.
- **Do not change any other user-facing string**, only the network-failure one.
- Do not consolidate the per-action error constants (`FACTOR_MAPPING_FAILURE`
  and friends) — those are deliberately per-path and carry different text for
  good reason.
- Do not move anything into `lib/validation/` that reads a secret or imports
  `lib/db/`.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build` — quote the route table

## Where the result is recorded

`docs/backend.md`, write-path UI section. Record every variant found with its
exact text, the sentence chosen and why, the constant's location, and the list
of sites whose displayed copy changed.

## SKILLS USED

- `nextjs` — module boundaries and what a client leaf's import pulls into a
  bundle.
- `vercel-react-best-practices` — bundle impact of the shared module choice.
- `zod-docs` — only if the constant lands next to `lib/validation/`'s schemas;
  confirm nothing there is `server-only` and the boundary §6.3 protects stays
  intact.
