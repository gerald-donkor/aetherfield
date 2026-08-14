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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
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
    },
    {
      name: TEARDOWN_PROJECT,
      testMatch: /auth\.teardown\.ts$/,
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
    },
  },
});
