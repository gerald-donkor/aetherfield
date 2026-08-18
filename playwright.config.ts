import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

/** The setup and teardown files are projects of their own; the browser
    projects must not pick them up as ordinary tests as well. */
const AUTH_LIFECYCLE = /auth\.(setup|teardown)\.ts$/;

/**
 * The two lifecycle projects, named once — prompt 78.
 *
 * `e2e/support/fixture.ts` derives the **browser** project list from
 * `projects` below by removing these two, because prompt 78's walk provisions
 * one grant target per browser project and a target list that restated the
 * browsers would silently leave a new project without one.
 */
export const SETUP_PROJECT = "setup";
export const TEARDOWN_PROJECT = "teardown";

/**
 * The engine the two lifecycle projects launch — prompt 128.
 *
 * They declared no `use` at all, so they fell to Playwright's default
 * `chromium`, and the WebKit run resolves `setup` as a dependency inside an
 * image that carries **only** WebKit (`tools/playwright-webkit/Containerfile`).
 * Every WebKit run since prompt 74 died on `browserType.launch: Executable
 * doesn't exist at /ms-playwright/chromium_headless_shell-*`.
 *
 * `scripts/playwright-webkit.sh` sets this to `webkit`; unset means `chromium`,
 * so the native `test:e2e:local` run is unchanged. An unrecognised value is a
 * hard error rather than a silent default — a typo that quietly restored the
 * breakage is the failure mode this exists to end.
 */
const LIFECYCLE_BROWSERS = ["chromium", "firefox", "webkit"] as const;
type LifecycleBrowser = (typeof LIFECYCLE_BROWSERS)[number];

function resolveLifecycleBrowser(): LifecycleBrowser {
  const requested = process.env.E2E_LIFECYCLE_BROWSER;

  if (!requested) return "chromium";

  if (!(LIFECYCLE_BROWSERS as readonly string[]).includes(requested)) {
    throw new Error(
      `E2E_LIFECYCLE_BROWSER must be one of ${LIFECYCLE_BROWSERS.join(", ")}; received "${requested}".`,
    );
  }

  return requested as LifecycleBrowser;
}

const LIFECYCLE_BROWSER = resolveLifecycleBrowser();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  /**
   * Raised ceilings, not relaxed assertions — prompt 128.
   *
   * WebKit runs inside the rootless container, where every server render and
   * every Server Action pays a userspace-networked round trip to Neon, and four
   * workers pay it concurrently. Three cases went over Playwright's 5 s `expect`
   * default on one run and passed on the next, each with the work visibly still
   * in flight rather than wrong — a button reading `Updating...` and a
   * `/account` navigation still resolving.
   *
   * A ceiling only bounds how long a *true* assertion may take to become true;
   * a false one still fails, just later. Nothing about what the suite proves
   * changes, and the native leg — which settles far inside the old 5 s — keeps
   * the same results it had at 110 passed, 12 skipped.
   */
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    /* Prompt 74. The fixture signs in **once** per run and the browser
       projects reuse the saved `storageState`: Better Auth's rate limiting is
       on with database storage, and a per-test sign-in would trip it and
       produce a flake that reads as an auth bug. */
    {
      name: SETUP_PROJECT,
      testMatch: /auth\.setup\.ts$/,
      teardown: TEARDOWN_PROJECT,
      use: { browserName: LIFECYCLE_BROWSER },
    },
    {
      name: TEARDOWN_PROJECT,
      testMatch: /auth\.teardown\.ts$/,
      use: { browserName: LIFECYCLE_BROWSER },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: AUTH_LIFECYCLE,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      dependencies: ["setup"],
      testIgnore: AUTH_LIFECYCLE,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      dependencies: ["setup"],
      testIgnore: AUTH_LIFECYCLE,
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    /**
     * **Test-run values for variables that already exist**, merged over
     * `process.env` by Playwright (`runner/index.js`) and winning over
     * `.env.local`, which `@next/env` never applies to a key already present.
     * No new variable, and `.env.example` is unchanged (AGENTS.md 8.4).
     *
     * `BETTER_AUTH_URL` — Better Auth seeds its trusted origins from this, and
     * `.env.local` names a different origin from the one Playwright serves on.
     * Without the override every fixture POST carrying a cookie is refused as
     * a cross-origin request. **The fix is this, not `disableCSRFCheck` or
     * `disableOriginCheck`** — both are flagged as security risks by
     * `better-auth-security-best-practices`, and both would weaken the shipped
     * application to suit a test.
     *
     * `RESEND_API_KEY` — emptied, so the run sends no mail at all.
     * `sendOnSignUp` is on, so each fixture sign-up would otherwise hand a
     * synthetic address to a real provider. `lib/email/send.ts` throws on an
     * unset key and `lib/email/auth.ts` catches it and logs a template name,
     * so suppression costs nothing and changes no code path under test. The
     * alternative — letting the sends run — buys nothing: the sandbox sender
     * in `lib/email/config.ts` delivers only to the Resend account's own
     * address and refuses everything else, so the mail could not arrive, and
     * a test run that generates provider traffic for no observation is a
     * deliverability cost with no return.
     */
    env: {
      BETTER_AUTH_URL: baseURL,
      RESEND_API_KEY: "",
      /* The application's own Neon handshake races the same Happy Eyeballs
         attempt budget `e2e/support/database.ts` documents. Appended, never
         replacing, so a caller's own `NODE_OPTIONS` survives. */
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        "--network-family-autoselection-attempt-timeout=5000",
      ]
        .filter(Boolean)
        .join(" "),
    },
  },
});
