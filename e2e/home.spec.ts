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
