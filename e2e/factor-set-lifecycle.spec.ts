import { expect, test, type Page } from "@playwright/test";

import { OWNER_STATE_PATH } from "./support/fixture";

/**
 * A factor set's lifecycle, walked in a browser — prompt 84.
 *
 * Three things are asserted and nothing else: an owner corrects a set's licence
 * and source reference and the **page** renders the correction; renaming a set
 * onto an existing `(source, dataset_version)` is refused and changes nothing;
 * and a retired set leaves both set choosers while its rows read "Set retired".
 *
 * Every read-back comes from the Server Component's own output after the
 * refresh, never from a leaf's result message — the leaf will happily report
 * what it sent, which is not what was stored.
 *
 * **Chromium only**, for `factor-import.spec.ts`'s reason verbatim: the three
 * browser projects run against the same organisation at the same time, and this
 * walk asserts server-side state on sets it creates. It is a server-side
 * property, not a rendering one, so running it once is the honest cost.
 *
 * Every locator is an accessible role or visible text. The class names are
 * settled design output and a test must not pin them.
 */

test.use({ storageState: OWNER_STATE_PATH });

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "One walk is enough for a server-side property; see this file's docblock.",
);

/** Unique per run, so a re-run does not collide with the sets the previous run
    created — `(organization_id, source, dataset_version)` is unique and the
    action answers a collision as `set_exists`, which is exactly what the second
    test asserts *deliberately*. */
const RUN = `${Date.now().toString(36)}`;
const SET_A = `E2E lifecycle set A ${RUN}`;
const SET_B = `E2E lifecycle set B ${RUN}`;
const VERSION = "2026 contract";

const ORIGINAL_LICENCE = "Supplier contract";
const CORRECTED_LICENCE = `Supplier contract, corrected ${RUN}`;
const CORRECTED_REFERENCE = `Contract ref ${RUN}`;

/** The row label the rows list renders — `level_2 · level_3`, joined by
    `factorMatchSourceText`. Unique per run so the assertion cannot land on
    another spec's row. */
const ROW_LEVEL_2 = "Liquid";
/** **Neither is a substring of the other**, which the first run of this walk
    needed: the rows list is newest first, so a `hasText` filter matching both
    and taking `.first()` read set B's row while asserting about set A's. */
const ROW_LEVEL_3_A = `E2E lifecycle diesel ${RUN}`;
const ROW_LEVEL_3_B = `E2E lifecycle petrol ${RUN}`;
const ROW_LABEL_A = `${ROW_LEVEL_2} · ${ROW_LEVEL_3_A}`;

const HEADER =
  "scope,activity_unit,gas,gwp_set,published_uom,published_ghg_unit,value,biogenic,level_1,level_2,level_3";

/** Synthetic throughout — no real supplier, no real factor value
    (AGENTS.md 8.3). */
function csv(level3: string, value: string): string {
  return [
    HEADER,
    `scope_1,litres,co2e,AR6,litres,kg CO2e,${value},false,Fixture fuels,${ROW_LEVEL_2},${level3}`,
    "",
  ].join("\n");
}

function importForm(page: Page) {
  return page.getByRole("region", { name: "Import factors" });
}

function addFactorForm(page: Page) {
  return page.getByRole("region", { name: "Add a factor" });
}

/** One set's row in the Factor sets list, as the Server Component renders it. */
function setRow(page: Page, source: string) {
  return page
    .getByRole("list", { name: "Customer-supplied factor sets" })
    .getByRole("listitem")
    .filter({ hasText: source })
    .first();
}

/** Creates a set through the import form, with one row in it. */
async function createSet(page: Page, source: string, level3: string, value: string) {
  await page.goto("/activity/factors");

  const form = importForm(page);
  await form.getByLabel("Factor set").selectOption("new");
  await form.getByLabel("Source", { exact: true }).fill(source);
  await form.getByLabel("Dataset/version").fill(VERSION);
  await form.getByLabel("Publication year").fill("2026");
  await form.getByLabel("Licence or basis").fill(ORIGINAL_LICENCE);
  await form.getByLabel("Effective from").fill("2026-01-01");
  await form.getByLabel("Effective to").fill("2026-12-31");
  await form.getByLabel("Internal source reference").fill(`E2E fixture ${RUN}`);

  await page.setInputFiles("#factor-import-file", {
    name: "e2e-lifecycle.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv(level3, value), "utf8"),
  });
  await form.getByRole("button", { name: "Import factors" }).click();

  await expect(form.getByText("Imported 1 row")).toBeVisible({
    timeout: 45_000,
  });
}

/** Opens one set's owner controls. The `<details>` is closed by default, so the
    fields inside it are not in the accessibility tree until it is. */
async function openControls(page: Page, source: string) {
  const row = setRow(page, source);
  await row.getByText("Correct or retire this set").click();
  return row;
}

test.describe.serial("a factor set's lifecycle", () => {
  test("corrects a set's provenance, and the page renders the correction", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await createSet(page, SET_A, ROW_LEVEL_3_A, "2.51233");

    await page.reload();
    const row = await openControls(page, SET_A);

    await row.getByLabel("Licence or basis").fill(CORRECTED_LICENCE);
    await row.getByLabel("Internal source reference").fill(CORRECTED_REFERENCE);
    await row.getByRole("button", { name: "Save corrections" }).click();

    await expect(row.getByText("Set updated.")).toBeVisible({
      timeout: 45_000,
    });

    /* The stored values, read from the Server Component's own output. */
    await page.reload();
    await expect(setRow(page, SET_A)).toContainText(CORRECTED_LICENCE);
    await expect(setRow(page, SET_A)).toContainText(CORRECTED_REFERENCE);
  });

  test("refuses a rename onto an existing source and version", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await createSet(page, SET_B, ROW_LEVEL_3_B, "2.16185");

    await page.reload();
    const row = await openControls(page, SET_B);

    await row.getByLabel("Source", { exact: true }).fill(SET_A);
    await row.getByRole("button", { name: "Save corrections" }).click();

    await expect(
      row.getByText("already has another set with this source and version"),
    ).toBeVisible({ timeout: 45_000 });

    /* Nothing changed: set B still carries its own source, and set A still
       carries the licence the first test corrected it to. */
    await page.reload();
    await expect(setRow(page, SET_B)).toContainText(ORIGINAL_LICENCE);
    await expect(setRow(page, SET_A)).toContainText(CORRECTED_LICENCE);
  });

  test("retires a set, taking it out of both choosers", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/activity/factors");

    const option = `${SET_A} — ${VERSION}`;
    await expect(
      importForm(page).getByLabel("Factor set").getByRole("option", {
        name: option,
      }),
    ).toHaveCount(1);

    const row = await openControls(page, SET_A);
    await row.getByRole("button", { name: "Retire set" }).click();
    await expect(row.getByText("Select confirm to retire it.")).toBeVisible();
    await row.getByRole("button", { name: "Confirm retire set" }).click();

    /* Read back from the Server Component after its refresh, not from the
       leaf's message — the leaf unmounts with the controls the moment the set
       renders as retired, which is the behaviour being asserted. */
    await expect(setRow(page, SET_A)).toContainText("Set retired", {
      timeout: 45_000,
    });

    await page.reload();

    /* Gone from both set choosers, and still listed as a set. */
    await expect(
      importForm(page).getByLabel("Factor set").getByRole("option", {
        name: option,
      }),
    ).toHaveCount(0);
    await expect(
      addFactorForm(page).getByLabel("Factor set").getByRole("option", {
        name: option,
      }),
    ).toHaveCount(0);
    await expect(setRow(page, SET_A)).toContainText("Set retired");

    /* Its rows are untouched — retirement does not cascade — and the rows list
       says so rather than calling them active. */
    await expect(
      page
        .getByRole("list", { name: "Customer-supplied factor rows" })
        .getByRole("listitem")
        .filter({ hasText: ROW_LABEL_A })
        .first(),
    ).toContainText("Set retired");
  });
});
