import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import {
  ORPHAN_STATE_PATH,
  OWNER_STATE_PATH,
  readRunRecord,
} from "./support/fixture";

/**
 * The first walk through a signed-in workspace — prompt 74.
 *
 * Until this file existed, every phase-two surface was verified by
 * type-checking, by `npm test` over `lib/domain/` and by hand — never by a
 * browser holding a session. `e2e/home.spec.ts` could assert only that a
 * signed-out caller is turned away.
 *
 * **`e2e/home.spec.ts` is untouched and stays session-free.** The saved
 * sessions are applied per-describe here, never as a project-wide default, so
 * the unauthenticated assertions keep meaning what they said.
 *
 * The record is read *inside* each test that needs it: Playwright enumerates
 * every test file before the setup project runs, so nothing may read it at
 * module scope.
 */

/** The six `requireOrganization()` pages that need no id. The two that do are
    asserted separately below. */
const MEMBER_PAGES = [
  "/dashboard",
  "/targets",
  "/reports",
  "/activity",
  "/activity/mappings",
  "/activity/factors",
];

/** Well-formed and certainly absent, so the page's own not-found path is what
    answers — not its id parser, and not the tenant gate. */
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

test.describe("a member of an organisation", () => {
  test.use({ storageState: OWNER_STATE_PATH });

  for (const route of MEMBER_PAGES) {
    test(`reaches ${route}`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }

  /* The two id-bearing gates. Asserting against an absent id keeps the walk
     about the gate rather than about seeded data: what matters is that the
     caller is let past `requireOrganization` and meets an ordinary 404, not a
     sign-in redirect and not another tenant's record. */
  test("meets a plain not-found on an absent import, not a sign-in redirect", async ({
    page,
  }) => {
    const response = await page.goto(`/activity/${ABSENT_ID}`);

    expect(response?.status()).toBe(404);
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  /**
   * **The status is deliberately not asserted here, and that is a finding, not
   * a convenience.** This route answers an absent report with the not-found
   * markup at HTTP **200**, where `/activity/[importId]` above answers 404.
   * The difference is `app/reports/loading.tsx`: the segment has a Suspense
   * boundary, so the shell is flushed — and the status committed — before
   * `notFound()` runs inside it. Measured on chromium and firefox, prompt 74;
   * recorded in `docs/backend.md`. Fixing it is a separate change and needs
   * its own decision, so this test asserts what the gate is for rather than
   * locking the status in either way.
   */
  test("meets a plain not-found on an absent report, not a sign-in redirect", async ({
    page,
  }) => {
    await page.goto(`/reports/${ABSENT_ID}`);

    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toHaveCount(1);
  });

  test("reaches the account page", async ({ page }) => {
    const response = await page.goto("/account");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { exact: true, level: 1, name: "Your account foundation is ready." }),
    ).toHaveCount(1);
  });

  /* The tenant edge. `resolveTenant` never accepts an organisation id from the
     request, so there is no id to tamper with — the assertion is on what a
     non-member sees, which is nothing of the other tenant at all. */
  test("sees its own organisation and never the neighbouring one", async ({
    page,
  }) => {
    const record = readRunRecord();

    await page.goto("/dashboard");

    await expect(page.locator("body")).toContainText(
      record.ownerOrganization.name,
    );
    await expect(page.locator("body")).not.toContainText(
      record.neighbourOrganization.name,
    );
  });
});

test.describe("a signed-in user who belongs to no organisation", () => {
  test.use({ storageState: ORPHAN_STATE_PATH });

  /* `requireOrganization`'s second branch, which no test had ever entered —
     and the one an ordinary new signup meets. Having no organisation yet is an
     ordinary state, so the destination is `/account`, where the create flow
     is, and never `/sign-in`. */
  for (const route of MEMBER_PAGES) {
    test(`is sent from ${route} to the account page, not to sign-in`, async ({
      page,
    }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/account$/);
      await expect(page).not.toHaveURL(/\/sign-in/);
    });
  }

  test("reaches the account page", async ({ page }) => {
    const response = await page.goto("/account");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});

/**
 * AGENTS.md 7.3's `getSessionCookie()` trap, asserted rather than trusted.
 *
 * `proxy.ts` checks only that a session cookie *exists*, so a forged one walks
 * straight past it — by design. The database-backed check on the page is what
 * has to catch it, and this is the test that says so. The cookie names come
 * from the real saved session rather than being written out here, so the
 * assertion cannot drift away from whatever Better Auth actually sets.
 */
test("turns away a forged session cookie that the proxy lets through", async ({
  browser,
  baseURL,
}) => {
  /* Typed from Playwright's own return type rather than restated here, so the
     forged copy carries every field the real one did. */
  type SavedState = Awaited<ReturnType<BrowserContext["storageState"]>>;
  const saved = JSON.parse(readFileSync(OWNER_STATE_PATH, "utf8")) as SavedState;

  expect(
    saved.cookies.length,
    "the saved session should carry at least one cookie",
  ).toBeGreaterThan(0);

  const forged = saved.cookies.map((cookie) => ({
    ...cookie,
    value: `${cookie.value.slice(0, 8)}forged-by-the-e2e-suite`,
  }));

  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: forged, origins: [] },
  });

  try {
    const page = await context.newPage();
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fdashboard$/);
  } finally {
    await context.close();
  }
});
