import { expect, test } from "@playwright/test";

test("renders the homepage heading", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Sustainability insights, built for business",
    }),
  ).toHaveCount(1);
});

test("keeps the targets workspace behind sign-in", async ({ page }) => {
  await page.goto("/targets");

  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Ftargets$/);
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Continue to Aetherfield",
    }),
  ).toHaveCount(1);
});

test("keeps the dashboard workspace behind sign-in", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fdashboard$/);
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Continue to Aetherfield",
    }),
  ).toHaveCount(1);
});

test("keeps the reports workspace behind sign-in", async ({ page }) => {
  await page.goto("/reports");

  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Freports$/);
  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Continue to Aetherfield",
    }),
  ).toHaveCount(1);
});

/** The export route is a Route Handler, so the optimistic proxy redirect is the
    first thing it meets — and a signed-out caller must never reach the handler's
    own 401 with a tenant's document behind it. */
test("keeps a report export behind sign-in", async ({ page }) => {
  await page.goto("/reports/00000000-0000-4000-8000-000000000000/export");

  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Freports%2F/);
});
