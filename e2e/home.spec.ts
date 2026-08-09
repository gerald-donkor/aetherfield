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
