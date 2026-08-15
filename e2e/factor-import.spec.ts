import { expect, test, type Page } from "@playwright/test";

import { OWNER_STATE_PATH } from "./support/fixture";

/**
 * The bulk factor-set CSV import, walked in a browser — prompt 82.
 *
 * Two things are asserted and nothing else: an owner imports a small valid file
 * and sees the counts, and a file with one bad row in the middle is refused
 * naming the line while the set's row count stays where it was. **The
 * all-or-nothing property is the one this walk exists for**, and it is read
 * back from the page the Server Component renders, never from the leaf's own
 * result message.
 *
 * **Chromium only.** The three browser projects run against the same
 * organisation at the same time, and this walk asserts an exact row count on a
 * set it creates — three projects importing into three sets is fine, but the
 * walk is a server-side property, not a rendering one, so running it once is
 * the honest cost. `factor-picker.spec.ts` records the same reasoning for its
 * shared reads.
 *
 * Every locator is an accessible role or visible text. The class names are
 * settled design output and a test must not pin them.
 */

test.use({ storageState: OWNER_STATE_PATH });

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "One walk is enough for a server-side property; see this file's docblock.",
);

/** Unique per run, so a re-run does not collide with the set the previous run
    created — `(organization_id, source, dataset_version)` is unique and the
    action answers a collision as `set_exists`. */
const RUN = `${Date.now().toString(36)}`;
const SET_SOURCE = `E2E supplier tariff ${RUN}`;
const SET_VERSION = "2026 contract";

const HEADER =
  "scope,activity_unit,gas,gwp_set,published_uom,published_ghg_unit,value,biogenic,level_1,level_2,level_3";

/** Two rows that differ in `level_3`, so they are two rows in the set rather
    than one. Synthetic throughout — no real supplier, no real factor value
    (AGENTS.md 8.3). */
const VALID_ROWS = [
  "scope_1,litres,co2e,AR6,litres,kg CO2e,2.51233,false,Fixture fuels,Liquid,Diesel",
  "scope_1,litres,co2e,AR6,litres,kg CO2e,2.16185,false,Fixture fuels,Liquid,Petrol",
];

/** One good row, one row whose scope is outside the vocabulary, one good row.
    `Scope 1` is exactly the mis-spelling the importer refuses to guess at. */
const ONE_BAD_ROW = [
  "scope_1,litres,co2e,AR6,litres,kg CO2e,3.11111,false,Fixture fuels,Liquid,Kerosene",
  "Scope 1,litres,co2e,AR6,litres,kg CO2e,3.22222,false,Fixture fuels,Liquid,Gas oil",
  "scope_1,litres,co2e,AR6,litres,kg CO2e,3.33333,false,Fixture fuels,Liquid,Fuel oil",
];

function csv(rows: string[]): string {
  return [HEADER, ...rows, ""].join("\n");
}

async function attach(page: Page, name: string, rows: string[]) {
  await page.setInputFiles("#factor-import-file", {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv(rows), "utf8"),
  });
}

/**
 * The import form's own section.
 *
 * **Every control is looked up inside it**, because the single-row form sits on
 * the same page and carries the same labels — "Factor set", "Source",
 * "Licence or basis". The `<section aria-labelledby>` is a `region` named by its
 * heading, which is the boundary the page already had.
 */
function importForm(page: Page) {
  return page.getByRole("region", { name: "Import factors" });
}

/** The set's own row in the Factor sets list, as the Server Component renders
    it — the read-back that makes the all-or-nothing assertion mean something. */
function setRow(page: Page) {
  return page
    .getByRole("list", { name: "Customer-supplied factor sets" })
    .getByRole("listitem")
    .filter({ hasText: SET_SOURCE })
    .first();
}

test.describe.serial("importing a customer-supplied factor set", () => {
  test("imports every row of a valid file into a new set", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/activity/factors");

    const form = importForm(page);
    await form.getByLabel("Factor set").selectOption("new");
    await form.getByLabel("Source", { exact: true }).fill(SET_SOURCE);
    await form.getByLabel("Dataset/version").fill(SET_VERSION);
    await form.getByLabel("Publication year").fill("2026");
    await form.getByLabel("Licence or basis").fill("Supplier contract");
    await form.getByLabel("Effective from").fill("2026-01-01");
    await form.getByLabel("Effective to").fill("2026-12-31");
    await form
      .getByLabel("Internal source reference")
      .fill(`E2E fixture ${RUN}`);

    await attach(page, "e2e-factors.csv", VALID_ROWS);
    await form.getByRole("button", { name: "Import factors" }).click();

    await expect(form.getByText("Imported 2 rows")).toBeVisible({
      timeout: 45_000,
    });

    /* The count the database holds, not the count the action returned. */
    await expect(setRow(page)).toContainText("2 active", { timeout: 45_000 });
  });

  test("refuses a file with one bad row and writes nothing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/activity/factors");

    const form = importForm(page);
    await form
      .getByLabel("Factor set")
      .selectOption({ label: `${SET_SOURCE} — ${SET_VERSION}` });

    await attach(page, "e2e-factors-bad.csv", ONE_BAD_ROW);
    await form.getByRole("button", { name: "Import factors" }).click();

    await expect(form.getByText("Nothing was imported.")).toBeVisible({
      timeout: 45_000,
    });
    /* Line 3, because line 1 is the header — the physical line a text editor
       shows. */
    await expect(form.getByText(/^Line 3: scope:/)).toBeVisible();

    await page.reload();
    await expect(setRow(page)).toContainText("2 active");
  });
});
