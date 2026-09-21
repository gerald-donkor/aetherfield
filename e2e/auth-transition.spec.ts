import { expect, test } from "@playwright/test";

import { readRunRecord } from "./support/fixture";

function pathname(url: string): string {
  return new URL(url).pathname;
}

test("signs in once, settles the shared session, and signs out", async ({
  browserName,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "One browser owns the one-time credential mutation and request-count probe.",
  );

  const record = readRunRecord();
  const initialSession = page.waitForResponse(
    (response) => pathname(response.url()) === "/api/auth/get-session",
  );
  await page.goto("/sign-in");
  await initialSession;

  const startedAt = Date.now();
  const counts = { signIn: 0, session: 0, account: 0 };
  const timings: number[] = [];
  page.on("request", (request) => {
    const path = pathname(request.url());
    if (path === "/api/auth/sign-in/email") counts.signIn += 1;
    if (path === "/api/auth/get-session") counts.session += 1;
    if (path === "/account" && request.method() === "GET") {
      counts.account += 1;
      timings.push(Date.now() - startedAt);
    }
  });

  const navigationEntriesBefore = await page.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );

  await page.getByLabel("Email").fill(record.authTransition.user.email);
  await page.getByLabel("Password").fill(record.authTransition.password);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.locator("header").getByRole("link", { exact: true, name: "Account" }),
  ).toBeVisible();

  /* A deliberate stability window: the regression was a second refresh after
     the destination had already rendered, so the absence must be observed
     after the first transition rather than asserted at its first response. */
  await page.waitForTimeout(1_500);

  expect(counts.signIn).toBe(1);
  expect(counts.session).toBe(1);
  expect(counts.account).toBe(1);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(
    navigationEntriesBefore,
  );

  console.log(
    `[e2e] auth transition: sign-in=${counts.signIn}, session=${counts.session}, account=${counts.account}, account-ms=${timings.join(",")}`,
  );

  await page.getByRole("button", { exact: true, name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page
      .locator("header")
      .getByRole("link", { exact: true, name: "Get started" }),
  ).toBeVisible();

  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Faccount$/);
});
