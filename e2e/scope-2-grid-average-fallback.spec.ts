import { expect, test, type Locator, type Page } from "@playwright/test";

import { OWNER_STATE_PATH } from "./support/fixture";

/**
 * The reporter-chosen grid-average fallback, walked in a browser — prompt 86.
 *
 * One property, end to end: a reporter with **no** contractual instrument for a
 * pair chooses the Scope 2 Guidance's rung 5 explicitly, and the resulting
 * market-based figure is **labelled as a fallback everywhere it is shown**.
 * That labelling is the entire difference between this and the silent
 * substitution prompt 85's D5 refuses, so it is what this file asserts.
 *
 * **A different pair from `market-based-scope-2.spec.ts`.** That walk owns
 * `(electricity, kWh)`; this one owns `(heat, kWh)`, which is the other
 * category `SCOPE2_MARKET_LANE_CATEGORIES` offers the lane on. The three
 * browser projects share one organisation, so two specs mapping the same pair's
 * market lane would race for the same row.
 *
 * **Chromium only**, for that file's reason verbatim: this is a server-side
 * property, not a rendering one, and running it once is the honest cost.
 *
 * Every figure lookup is `exact: true` — "Total, scopes 1-3" is a prefix of
 * "Total, scopes 1-3 (market-based)".
 */

test.use({ storageState: OWNER_STATE_PATH });

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "One walk is enough for a server-side property; see this file's docblock.",
);

/** A published DESNZ scope 2 row admissible for `kWh`, and **not** market-based
    — which is exactly what rung 5 names. Confirmed present in the seeded 2026
    set before this spec was written. */
const GRID_ROW = "District heat and steam";

const ACTIVITY_CSV = [
  "site,date,category,description,quantity,unit",
  "E2E Fixture Site,2026-05-31,heat,Fixture site district heat,3000,kWh",
  "",
].join("\n");

const PAIR_HREF = "/activity/mappings?category=heat&unit=kWh";
const COMMIT_WAIT = 45_000;

function coverageRow(page: Page): Locator {
  return page
    .getByRole("list", { name: "Activity pairs and mapped factors" })
    .getByRole("listitem")
    .filter({ hasText: "heat · kWh" })
    .first();
}

function figure(page: Page, label: string): Locator {
  return page
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

test.describe.serial("scope 2, the reporter-chosen grid-average fallback", () => {
  test("commits a heat import", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/activity");
    await page.setInputFiles("#activity-import-file", {
      name: "e2e-heat-activity.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(ACTIVITY_CSV, "utf8"),
    });

    await Promise.all([
      page.waitForURL(/\/activity\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Stage import" }).click(),
    ]);

    const commit = page.getByRole("region", { name: "Commit or discard" });
    await commit.getByRole("button", { name: "Commit 1 row" }).click();
    await commit.getByRole("button", { name: "Confirm commit" }).click();

    await expect(
      page.getByText("The rows below are part of your activity records."),
    ).toBeVisible({ timeout: COMMIT_WAIT });
  });

  test("offers the fallback as a named choice, with its consequence stated", async ({
    page,
  }) => {
    await page.goto(PAIR_HREF);

    const row = coverageRow(page);
    await expect(row.getByText("Market-based lane")).toBeVisible();
    /* The offer says what it asserts, in the same sentence as the offer. A
       toggle that silently changed the picker's list would be the substitution
       this product refuses to make. */
    await expect(
      row.getByText("It is a statement that no better instrument exists", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      row.getByRole("link", { name: "Use the grid-average fallback" }),
    ).toBeVisible();
  });

  test("maps a grid average as rung 5 and labels the figure as one", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(PAIR_HREF);

    await Promise.all([
      page.waitForURL(/basis=fallback/),
      coverageRow(page)
        .getByRole("link", { name: "Use the grid-average fallback" })
        .click(),
    ]);

    /* The fallback's own picker, worded differently from the contractual one. */
    await expect(
      page.getByRole("heading", {
        name: "Choose a grid-average factor as the fallback",
      }),
    ).toBeVisible();

    const from = page.url();
    await page.getByLabel(/^Search factors for/).fill(GRID_ROW);
    await page.getByRole("button", { name: "Search exact text" }).click();
    await page.waitForURL((url) => url.href !== from);

    const candidate = page
      .getByRole("list", { name: "Eligible emission factors" })
      .getByRole("listitem")
      .filter({ hasText: GRID_ROW })
      .first();
    await expect(candidate).toBeVisible();
    await candidate.getByRole("button", { name: "Use factor" }).click();

    await expect(
      page.getByText("Grid-average fallback saved.", { exact: false }),
    ).toBeVisible({ timeout: COMMIT_WAIT });

    // -- the mapping says which rung it is ---------------------------------
    await page.goto(PAIR_HREF);
    await expect(coverageRow(page).getByText("grid average ·", { exact: false })).toBeVisible();
    await expect(
      coverageRow(page).getByText(
        "This pair's market-based figure is a grid average, recorded as the hierarchy's rung 5.",
        { exact: false },
      ),
    ).toBeVisible();

    // -- and so does the figure --------------------------------------------
    await page.goto("/activity");
    await expect(
      figure(page, "Scope 2 (market-based)").getByText(
        "on a grid-average factor chosen here as the hierarchy's rung 5",
        { exact: false },
      ),
    ).toBeVisible();
  });
});
