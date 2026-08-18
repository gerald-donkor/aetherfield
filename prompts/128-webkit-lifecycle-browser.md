# 128 — Give the auth lifecycle projects a browser the WebKit image actually carries

## Scope, and why it is next

**Repair `npm run test:e2e:webkit` so the WebKit leg of AGENTS.md §2's mandated
matrix runs again, then run the full matrix and record what WebKit reports.**

Why this is next, and not a build step: **there is no unbuilt build step and no
unlanded architecture candidate.** Resolved from the repository and `git log`
(§1 step 3, §12 rule 5):

- `docs/backend.md` carries a `## Step N` section for every one of build steps
  1–14 (§5.2), and `app/` carries the routes each produced — `dashboard`,
  `targets`, `reports`, `submissions`, `activity`, `account`, `invitation`,
  `newsletter`, `api/cron`.
- All six §5.4 architecture candidates are landed: prompt 121 (candidate 1),
  122 (3), 123 + 124 (2), 125 (4), 126 (5), 127 (6). `docs/architecture.md`'s
  closing section states this in terms of the landed table.

What is *not* finished is one of the project's own checks. **WebKit has not run
since prompt 74** (commit `b0717a1`, 14 Aug 2026, `Walk the signed-in workspace
with a real session`), and four separate prompts have recorded the failure as a
standing gap they did not own — `docs/architecture.md` lines 722, 847, 1180 and
1326, covering prompts 122, 123/124, 125 and 127. Each records the same string:

```
browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1234/…
```

§12 rule 9 says a blocked step is reported, not routed around — it has been
reported five times, which is the point at which the gap itself is the work. A
comp-fitted marketing site whose settled surfaces lean on `backdrop-blur`,
`position: sticky` and GSAP-folded transforms (front matter) has WebKit as the
one engine most likely to diverge, and its coverage has been dark for fourteen
prompts.

## The diagnosis, verified this session

Not recalled — read and reproduced:

| fact | how it was established |
| --- | --- |
| the pinned image carries **only WebKit** | `podman run --rm localhost/aetherfield-playwright-webkit:1.62.1 ls /ms-playwright` → `ffmpeg-1011`, `webkit-2336` |
| the image is built that way deliberately | `tools/playwright-webkit/Containerfile` line 5: `npx -y playwright@${PLAYWRIGHT_VERSION} install --with-deps webkit` |
| the runner runs **only** the webkit project | `scripts/playwright-webkit.sh`, final line: `playwright test --project=webkit "$@"` |
| but `webkit` declares `dependencies: ["setup"]` | `playwright.config.ts`, the `webkit` project |
| and the `setup` project declares **no `use`** | `playwright.config.ts`, the `SETUP_PROJECT` entry — so it falls to Playwright's default `browserName: "chromium"` |
| and `setup` really does launch a browser | `e2e/auth.setup.ts:181` takes the `{ browser }` fixture; `:111` calls `browser.newContext(...)`, once per provisioned identity |
| the version pin is *not* the problem | `node -p "require('@playwright/test/package.json').version"` → `1.62.1`; `sed -n 's/^ARG PLAYWRIGHT_VERSION=//p'` on the Containerfile → `1.62.1`; the runner's mismatch guard passes |
| `podman` is present and this is not the old gap | `podman --version` → `6.1.0`; the image exists locally. Prompts 121–122 recorded `which podman` empty; that description is stale and the later records already corrected it |

So: the WebKit run reaches the container, starts `webServer`, resolves the
`setup` dependency, and `setup` asks for Chromium, which the image does not
carry. **Prompt 55 recorded WebKit passing in 16.5 s** (`docs/automation.md`,
"Prompt 55 verification (10 Aug 2026)"); prompt 74 added the lifecycle projects
and, without touching the container, made every later WebKit run impossible.

## The fix

**Give the two lifecycle projects an explicit browser, chosen by an environment
variable that the WebKit runner sets.**

1. `playwright.config.ts` — the `SETUP_PROJECT` and `TEARDOWN_PROJECT` entries
   each gain `use: { browserName: <selected> }`, where the selection reads one
   variable (name it `E2E_LIFECYCLE_BROWSER`) and **defaults to `chromium`**, so
   the native `test:e2e:local` run is byte-for-byte the same run it is today.
   Validate the value against Playwright's three engine names and fail loudly on
   anything else rather than silently defaulting — a typo that quietly restores
   the current breakage is the failure mode this prompt exists to end.
2. `scripts/playwright-webkit.sh` — pass `--env E2E_LIFECYCLE_BROWSER=webkit` on
   the existing `podman run`, alongside the `HOME` and `PLAYWRIGHT_BROWSERS_PATH`
   lines already there.

**Why this and not "install Chromium in the image".** Adding `chromium` to the
Containerfile's `install --with-deps` line is the smaller diff, but it grows a
2.23 GB shared image for the sole purpose of running a fixture that writes
engine-neutral JSON, and it rebuilds an image every contributor has cached.
Cross-engine `storageState` is **already** how this suite works — the native run
provisions under Chromium and the `firefox` project reuses that state — so
provisioning under WebKit inside a WebKit-only image is the same arrangement,
not a new assumption. State this trade-off in `docs/automation.md` rather than
leaving the rejected option to be re-derived.

**Do not** touch `browserProjectNames()` in `e2e/support/fixture.ts`. It derives
its list from `playwright.config.ts`'s projects minus the two lifecycle names
(prompt 78), so a WebKit-only run still provisions one grant target per browser
project — three targets for one running project. That is wasteful, not wrong,
and changing it would change what the native run provisions too.

## Measurements, and the procedure that produces them

Nothing here is eyeballed. Record, in `docs/automation.md`:

1. **Before**: the failing invocation and its exact first error line — reproduce
   it once on the current tree before editing, so the record is this session's
   observation and not a quotation of `docs/architecture.md`.
2. **After**: `npm run test:e2e:webkit` — the engine the lifecycle ran under,
   passed/failed/skipped counts, and wall-clock duration, quoted from the
   reporter, next to prompt 55's 16.5 s for scale.
3. **The full matrix**: `npm run test:e2e` — Chromium + Firefox counts (the
   standing figure to compare against is **110 passed, 12 skipped**, recorded at
   `docs/architecture.md` lines 847 and 1180), then WebKit's.
4. Whether any run was against a **warm or cold** Neon instance, since §7.3's
   scale-to-zero note applies to a suite that signs users in (§ front matter:
   measured or judged, and say which).

## Triage rule for what WebKit then reports

WebKit is about to execute suites it has never executed. Expect findings, and
handle them under a stated rule rather than improvising:

- A failure that is **the harness's** — a fixture timing assumption, a selector
  that depends on a Chromium-only behaviour, a container path — is in scope and
  is fixed here.
- A failure that is **the product's**, i.e. a genuine WebKit-only defect in a
  shipped surface, is **recorded with its exact assertion and screenshot path,
  and reported, not fixed**, unless the fix is confined to a single client leaf
  and changes no prerendered markup. Anything larger becomes prompt 129 with a
  named scope. §8.1 is the reason: the marketing site is byte-stable and a
  WebKit fix that moves a measured surface is its own approved piece of work.
- A failure that reproduces once and not on a clean re-run is recorded as
  session-local flake **with both results quoted**, exactly as prompts 125 and
  127 did — never re-run into silence (§12 rule 4).

## Expected impact

**No application code changes.** The edit set is `playwright.config.ts` and
`scripts/playwright-webkit.sh`, plus `docs/automation.md`. If the triage rule
above admits a leaf fix, it is named in the commit and the docs and its
prerender impact is verified, not assumed.

### Prerender impact

`none — no route changes`, and it must be **verified**, not asserted (§4):
`npm run build`, confirm the route table (`/`, `/about`, `/careers`,
`/design-system`, `/journal`, `/forgot-password`, `/reset-password`, `/sign-in`,
`/sign-up`, `/verify-email`, `/_not-found` as `○`; `/article/[slug]` ×6 and
`/job-listing/[slug]` ×3 as `●`; the workspace routes as `ƒ`), and diff the
prerendered HTML per `docs/automation.md`. The standing warning about `/`,
`/journal` and `/careers` (front matter) stays in force — mask the box, report
the remainder separately, and never quote a bare page-wide `-metric AE`.

### Trust boundary

`none` for the shipped application — this prompt adds no request path and
changes no validation, authorisation or rate limit. The one boundary it touches
is the **test fixture's**, and it must stay where prompt 74 put it: the fixture
signs in through the app's own HTTP surface, makes exactly the two narrow direct
database writes `e2e/support/database.ts` justifies, and **relaxes no
authorisation check**. `disableCSRFCheck` / `disableOriginCheck` remain
forbidden — `playwright.config.ts`'s `webServer.env` comment already records why
`BETTER_AUTH_URL` is the sanctioned fix instead, and nothing here may weaken
that.

### Secrets and data

Reads no new environment variable in application code. `E2E_LIFECYCLE_BROWSER`
is a **test-runner** variable, set by `scripts/playwright-webkit.sh` on the
container invocation only — it is not `NEXT_PUBLIC_*`, is never read by shipped
code, and therefore does **not** go in `.env.example` (§8.4's canonical list is
the application's variables). The suite continues to run with
`RESEND_API_KEY: ""` so no synthetic address reaches a provider. No personal
data is stored, logged or transmitted; fixture addresses stay out of any quoted
output (§8.3 rule 2).

## Non-goals

- **Not** upgrading Playwright. The version pin is verified matching on both
  sides and an upgrade would rebuild the image and re-open every browser
  baseline — a separate piece of work.
- **Not** adding Chromium to the WebKit image (rejected above, with reasons).
- **Not** adding WebKit to CI, adding a CI workflow, or changing `retries` /
  `workers`.
- **Not** rewriting `e2e/support/fixture.ts`'s per-project grant targets.
- **Not** widening the E2E suite with new cases. The suite is what it is; this
  prompt makes an existing engine run it.
- **Not** editing `docs/architecture.md`'s historical per-prompt check tables.
  They are accurate records of what those prompts observed. The closure is
  recorded once, in `docs/automation.md`, which owns the runner.
- **Not** a `npm test` (`lib/domain/`) change — nothing in scope is under it.

## Checks

Run, and quote the exact output (§12 rule 3):

| check | why |
| --- | --- |
| `npm run lint` | the two edited files are linted TS/shell-adjacent |
| `npm run typecheck` | `playwright.config.ts` is typechecked |
| `npm test` | expect **318 passed, 13 files**, unchanged — nothing in scope is under `lib/domain/` |
| `npm run build` + prerender diff | the §8.1 verification above |
| `npm run test:e2e:webkit` | **the point of the prompt** |
| `npm run test:e2e` | the full matrix, all three engines, in one run |

**Record the result in `docs/automation.md`** — it owns the Playwright runner,
the Podman image and the WebKit boundary (its "WebKit crosses a container
boundary on Arch" section). Add the closure note there, phrased so a later
session reading `docs/architecture.md`'s four standing-gap lines can see they
are closed. No new `docs/` file, no new index row, and **nothing added to
AGENTS.md** — this prompt clears no invariant bar in the front matter's cap
rule.

## SKILLS USED

- **`nextjs`** — `playwright.config.ts`'s `webServer` runs `next build` and
  `next start`; confirm the route table's `○` / `●` / `ƒ` symbols and the
  build-output reading before quoting them as a check result.
- **`better-auth-security-best-practices`** — re-read before touching anything
  the fixture does to sign in, to confirm the standing refusal of
  `disableCSRFCheck` / `disableOriginCheck` that `playwright.config.ts`'s
  comment records.
- **`better-auth-best-practices`** — only if a WebKit failure turns out to be in
  session or cookie handling rather than in the runner; the `storageState`
  question is a session question.
- **`tailwind-4-docs`** — only if triage surfaces a WebKit-only rendering
  divergence in a utility (`backdrop-blur`, `sticky`, the independent
  `translate` / `rotate` / `scale` properties the front matter warns GSAP
  consumes). Do not guess at engine support; read it.

**No skill covers Playwright, Podman or the container image**, and this is
stated rather than passed over (§1 step 2). Every Playwright API used —
`browserName` in a project's `use`, project `dependencies`, `testIgnore` — is
verified against `node_modules/@playwright/test` at execution time, not written
from memory (§12 rule 2). Every `podman run` flag is verified against
`podman run --help` before being added.
