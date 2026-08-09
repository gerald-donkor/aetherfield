# Initialise Playwright E2E testing

> Execution note (9 Aug 2026): after the approved three-browser matrix exposed
> that Playwright's WebKit fallback cannot run on this Arch Linux host and its
> dependency installer requires unavailable `apt-get`, the user directed that
> Playwright be made working. The shipped local matrix is therefore Chromium
> and Firefox; WebKit waits for a supported Debian/Ubuntu CI runner. The exact
> boundary and failed official dependency probe are recorded in
> `docs/automation.md`.

## Scope and why this is next

Initialise Playwright as a first-party TypeScript end-to-end test harness for
the existing Next.js application. This is next because the user explicitly
requested Playwright initialisation, while the repository currently has no
Playwright dependency, configuration, test script, or committed E2E test and
`docs/automation.md` still relies on a transient `playwright-core` installation
from npm's cache.

Keep this a tooling-only change. It must make one deterministic smoke test
runnable against a production Next.js build without modifying application
components, route content, styling, data access, or provider configuration.

## Reference material read

- `AGENTS.md`, especially sections 1-4, the static-site contract in section
  8.1, and the anti-fabrication rules in section 12.
- `docs/automation.md`, especially the existing Playwright cache workaround,
  the production-server/port guidance, and the stale-server warning.
- `package.json`, `package-lock.json`, `.gitignore`, and `tsconfig.json` for the
  current npm scripts, dependencies, ignored outputs, and TypeScript scope.
- `app/page.tsx`, `app/layout.tsx`, and
  `app/_components/home/hero.tsx` for a stable homepage smoke assertion.
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`, the
  installed Next.js 16.2 guide for Playwright setup and production-build E2E
  testing.
- Playwright's official installation, configuration, browser, and web-server
  documentation at `https://playwright.dev/docs/intro`,
  `https://playwright.dev/docs/test-configuration`,
  `https://playwright.dev/docs/test-webserver`, and
  `https://playwright.dev/docs/browsers`.

No comp, screenshot, or recording is a source for this tooling-only task.

## SKILLS USED

- `nextjs` - verify that the E2E harness starts and tests this Next.js 16 App
  Router application using the installed framework guidance.
- `next-best-practices` - preserve the application's route and rendering
  boundaries while adding project-level test tooling.

There is no installed Playwright-specific skill. Verify Playwright APIs and CLI
behaviour from the official live documentation and the installed package after
installation; do not write them from memory.

## Implementation requirements

1. Re-read this approved prompt and load every skill in `SKILLS USED` before
   changing implementation files.
2. Re-check `git status`, the current highest prompt number, and `git log -1`
   before editing. Preserve all unrelated or concurrent work, including the
   existing untracked `prompts/50-branded-application-success-dialog.md`.
3. Initialise the current npm project with the current stable
   `@playwright/test` as a development dependency and update `package-lock.json`.
   Use TypeScript. Resolve and record the installed version from the resulting
   package/lockfile or `npx playwright --version`; never invent a version.
4. Install the browser binaries needed by the committed Playwright projects.
   Use Playwright's own installer. Do not commit browser binaries or cache
   directories. If network or system-level installation requires approval,
   request it rather than substituting the old npm-cache workaround.
5. Add `playwright.config.ts` with:
   - `testDir` pointing at a dedicated `e2e/` directory;
   - the standard CI guards (`forbidOnly`, CI-only retries and one worker);
   - an HTML reporter whose generated output stays untracked;
   - `trace: "on-first-retry"`;
   - a fixed local `baseURL` on port `3100`;
   - a `webServer` that builds and starts the production Next.js application
     on port `3100`, waits for that exact URL, and sets
     `reuseExistingServer: false` so a stale process cannot be mistaken for the
     just-built application;
   - projects for Chromium, Firefox, and WebKit using Playwright's verified
     desktop device descriptors.
6. Add the smallest meaningful test at `e2e/home.spec.ts`. Navigate with the
   configured relative base URL and assert that the homepage exposes one level
   1 heading with the accessible name
   `Sustainability insights, built for business`. Use Playwright's role locator
   and web-first assertion. Do not test an external site, take visual snapshots,
   submit a form, touch personal data, or depend on provider credentials.
7. Add these npm scripts to `package.json`:
   - `test:e2e`: run the Playwright suite;
   - `test:e2e:ui`: open Playwright UI mode.
   The production build/start lifecycle belongs in the Playwright `webServer`
   configuration so direct `npx playwright test` and the npm script behave the
   same way.
8. Extend `.gitignore` only for Playwright-generated test output (at minimum
   `test-results/`, `playwright-report/`, and `blob-report/` if the installed
   scaffold/config can emit it). Do not ignore the config, tests, or snapshots
   directory globally.
9. Update the current-script list in `AGENTS.md` to include the scripts that now
   exist. This is a command-contract correction, not implementation history.
10. Update `docs/automation.md` to replace the statement that Playwright is not
    a project dependency. Record the installed setup, normal run/UI commands,
    browser-install command, production-server behaviour, isolated port, and
    the continuing rules about stale servers, fonts, animation settling, and
    page-specific screenshot comparisons. Do not erase still-valid measurement
    procedures.

## Measurements and acceptance criteria

This task has no visual measurement target. Its exact acceptance criteria are:

- `@playwright/test` is a direct development dependency with a lockfile entry;
- `npx playwright --version` reports the installed version;
- the configured browser binaries are installed successfully;
- Playwright discovers exactly the intended homepage smoke test for each of the
  three configured browser projects;
- `npm run test:e2e` builds the production app, starts the server on port 3100,
  and passes in Chromium, Firefox, and WebKit;
- Playwright shuts down its managed web server when the run ends;
- generated reports/results remain untracked;
- no application source or prerendered route markup changes.

If a browser cannot launch because a host system dependency is missing, report
the exact error and use Playwright's verified dependency installation command;
do not silently reduce the committed browser matrix.

## Expected impact

- Adds project-level Playwright tooling, one E2E smoke test, npm scripts, and
  documentation.
- No route, component, layout, CSS, database schema, request path, environment
  variable, secret, or runtime behaviour changes.
- The test process performs read-only HTTP navigation to the locally managed
  production server.

## Prerender impact

None. Every existing prerendered route must keep identical HTML and the same
render mode. Verify this from a fresh `npm run build` route table and by
comparing `.next/server/app/**/*.html` against the current parent commit with
only `.next/BUILD_ID` normalised, following `docs/automation.md`. Because the
change is outside `app/` and does not alter runtime dependencies, all pages are
expected to be byte-identical; any difference is a finding to investigate.

## Non-goals

- No GitHub Actions or other CI workflow: the user requested initialisation,
  not CI integration.
- No comprehensive route, form, auth, email, database, upload, accessibility,
  or visual-regression suite.
- No component testing, Playwright MCP, Playwright agent CLI, snapshots, page
  objects, fixtures, seeded data, or provider mocks.
- No changes to settled marketing surfaces, motion, navigation, footer, or
  application code.
- No reuse of the transient npm-cache `playwright-core` path for the committed
  test harness.

## Checks

Run and quote the exact output of:

1. `npx playwright --version`
2. `npx playwright test --list`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run test:e2e`
6. `npm run build` if the E2E run did not leave a fresh, clearly attributable
   route table to quote separately
7. `git status --short`

Verify the production route table remains unchanged and perform the parent
commit prerendered-HTML comparison described above. Confirm no generated
Playwright output appears in `git status`.

Record the completed setup and exact observed check results in
`docs/automation.md`. Commit the complete change to `main` without pushing.
