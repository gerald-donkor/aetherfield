import { expect, test, type Locator, type Page } from "@playwright/test";

import { OWNER_STATE_PATH } from "./support/fixture";

/**
 * Dual-reported scope 2, walked in a browser — prompt 85.
 *
 * One property, end to end: a reporter imports a contractual rate as a
 * customer-supplied factor, maps it on the **market lane** of an
 * `(electricity, kWh)` pair that already carries a grid-average factor, and
 * `/activity` then shows **two labelled scope 2 figures that are not the same
 * number**. That is the Scope 2 Guidance's dual reporting made real, and it is
 * the one thing this file asserts.
 *
 * **Chromium only**, for `factor-import.spec.ts`'s reason verbatim: the three
 * browser projects run against the same organisation at the same time, and this
 * walk asserts server-side state on rows it creates. It is a server-side
 * property, not a rendering one, so running it once is the honest cost.
 *
 * **Every string this file matches on is unique to this run or exact.** Prompt
 * 84's walk failed on a label that was a superstring of another one, and the
 * figures here are a live instance of that trap: "Total, scopes 1-3" is a
 * prefix of "Total, scopes 1-3 (market-based)". Every figure lookup below is
 * `exact: true` for that reason.
 *
 * Every locator is an accessible role or visible text. The class names are
 * settled design output and a test must not pin them.
 */

test.use({ storageState: OWNER_STATE_PATH });

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "One walk is enough for a server-side property; see this file's docblock.",
);

/** Unique per run: `(organization_id, source, dataset_version)` is unique, and
    a re-run must not collide with the set the previous run created. */
const RUN = `${Date.now().toString(36)}`;
const SET_SOURCE = `E2E market supply ${RUN}`;
const VERSION = "2026 contract";

/** The rate's row label, `level_2 · level_3`. **Neither half collides with any
    other spec's row**, and "supply" appears in no DESNZ label the lexical
    search would also return. */
const ROW_LEVEL_2 = "Contracted supply";
const ROW_LEVEL_3 = `E2E market rate ${RUN}`;

/** Synthetic, and deliberately far from any grid average, so the two figures
    cannot coincide by accident. No real supplier and no real contract
    (AGENTS.md 8.3). */
const RATE = "0.01234";

const FACTOR_HEADER =
  "scope,scope2_method,activity_unit,gas,gwp_set,published_uom,published_ghg_unit,value,biogenic,level_1,level_2,level_3";

const FACTOR_CSV = [
  FACTOR_HEADER,
  `scope_2,market_based,kwh,co2e,AR6,kWh,kg CO2e,${RATE},false,E2E fixture,${ROW_LEVEL_2},${ROW_LEVEL_3}`,
  "",
].join("\n");

/** The activity the two lanes both cost. The dates sit inside the seeded 2026
    set's window and inside the rate's own, so neither lane is out of period. */
const ACTIVITY_CSV = [
  "site,date,category,description,quantity,unit",
  "E2E Fixture Site,2026-05-31,electricity,Fixture site metered supply,4000,kWh",
  "",
].join("\n");

const PAIR_HREF = "/activity/mappings?category=electricity&unit=kWh";
const COMMIT_WAIT = 45_000;

function importForm(page: Page) {
  return page.getByRole("region", { name: "Import factors" });
}

/** The `(electricity, kWh)` row in the coverage list. */
function coverageRow(page: Page): Locator {
  return page
    .getByRole("list", { name: "Activity pairs and mapped factors" })
    .getByRole("listitem")
    .filter({ hasText: "electricity · kWh" })
    .first();
}

/**
 * One figure block from the emissions summary, by its exact label.
 *
 * `dl > div` is the shape `Figure` renders into. The label is matched exactly
 * because three of the labels on this page are prefixes of others.
 */
function figure(page: Page, label: string): Locator {
  return page
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

async function figureValue(page: Page, label: string): Promise<string> {
  return (await figure(page, label).locator("dd").first().innerText()).trim();
}

test.describe.serial("market-based scope 2, dual reported", () => {
  test("imports a contractual rate as a customer-supplied factor", async ({
    page,
  }) => {
    await page.goto("/activity/factors");

    const form = importForm(page);
    await form.getByLabel("Factor set").selectOption("new");
    await form.getByLabel("Source", { exact: true }).fill(SET_SOURCE);
    await form.getByLabel("Dataset/version").fill(VERSION);
    await form.getByLabel("Publication year").fill("2026");
    await form.getByLabel("Licence or basis").fill("Supplier contract");
    await form.getByLabel("Effective from").fill("2026-01-01");
    await form.getByLabel("Effective to").fill("2026-12-31");
    await form
      .getByLabel("Internal source reference")
      .fill(`E2E fixture ${RUN}`);

    await page.setInputFiles("#factor-import-file", {
      name: "e2e-market-rate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(FACTOR_CSV, "utf8"),
    });
    await form.getByRole("button", { name: "Import factors" }).click();

    await expect(form.getByText("Imported 1 row")).toBeVisible({
      timeout: COMMIT_WAIT,
    });
  });

  test("commits an electricity import", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/activity");
    await page.setInputFiles("#activity-import-file", {
      name: "e2e-market-activity.csv",
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

  test("offers a market lane on the pair, unmapped, without borrowing the grid average", async ({
    page,
  }) => {
    await page.goto(PAIR_HREF);

    const row = coverageRow(page);
    await expect(row.getByText("Market-based lane")).toBeVisible();
    /* The whole point of D5, in the reporter's own view: an absent contractual
       rate says so, and says that nothing was substituted for it. */
    await expect(
      row.getByText(
        "No contractual rate is mapped, so this pair contributes to the location-based figure only.",
        { exact: false },
      ),
    ).toBeVisible();
  });

  test("maps the rate on the market lane and reports both figures", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto(PAIR_HREF);

    await Promise.all([
      page.waitForURL(/lane=market/),
      coverageRow(page).getByRole("link", { name: "Map a rate" }).click(),
    ]);

    /* The market lane's own picker, not the default one. */
    await expect(
      page.getByRole("heading", { name: "Choose a market-based rate" }),
    ).toBeVisible();

    const from = page.url();
    await page.getByLabel(/^Search factors for/).fill(ROW_LEVEL_3);
    await page.getByRole("button", { name: "Search exact text" }).click();
    await page.waitForURL((url) => url.href !== from);

    const results = page.getByRole("list", {
      name: "Eligible emission factors",
    });
    const rate = results
      .getByRole("listitem")
      .filter({ hasText: ROW_LEVEL_3 })
      .first();
    await expect(rate).toBeVisible();
    await rate.getByRole("button", { name: "Use factor" }).click();

    /* The action recalculates inline, so the confirmation is the point at which
       both lanes have been written. */
    await expect(
      page.getByText(
        "Market-based rate saved. The organisation's figures have been recalculated on both lanes.",
      ),
    ).toBeVisible({ timeout: COMMIT_WAIT });

    // -- both figures, labelled, and different ------------------------------
    await page.goto("/activity");

    const locationScope2 = await figureValue(page, "Scope 2 (location-based)");
    const marketScope2 = await figureValue(page, "Scope 2 (market-based)");
    const total = await figureValue(page, "Total, scopes 1-3");
    const marketTotal = await figureValue(page, "Total, scopes 1-3 (market-based)");

    expect(locationScope2).not.toBe("");
    expect(marketScope2).not.toBe("");
    /* Two readings of the same consumption, and they are genuinely two: the
       fixture rate is far from any grid average, so equal figures here would
       mean one lane had been substituted for the other. */
    expect(marketScope2).not.toBe(locationScope2);
    expect(marketTotal).not.toBe(total);

    /* The coverage the market figure rests on is stated beside it, never
       implied to be complete. */
    await expect(
      figure(page, "Scope 2 (market-based)").getByText(
        "no grid average is substituted for them",
        { exact: false },
      ),
    ).toBeVisible();
  });
});
