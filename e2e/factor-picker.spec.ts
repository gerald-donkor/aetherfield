import { expect, test, type Locator, type Page } from "@playwright/test";

import { OWNER_STATE_PATH } from "./support/fixture";

/**
 * The factor picker, walked in a browser — prompt 77.
 *
 * Prompt 76 shipped `/activity/mappings`'s wording search with no browser-level
 * verification at all: its own record in `docs/backend.md` lists the E2E run as
 * "no test result", and names the interactive focus behaviour as the thing that
 * had never been exercised. This file is that gap closed, on the surface that
 * decides which factor multiplies a disclosure figure.
 *
 * **The import is obtained through the application's own UI**, not written into
 * the database — the same discipline prompt 74 applied to sign-up and
 * organisation creation. `/activity/mappings` renders the picker only when the
 * organisation has committed activity records
 * (`app/activity/mappings/page.tsx`'s `coverage.length === 0` branch), and
 * `?category=…&unit=…` does not route around it: `selected` is consulted only
 * inside the non-empty branch. So the walk stages and commits one import first,
 * and `test.describe.serial` is what stops the search assertions starting
 * before it.
 *
 * **Nothing here asserts a timing or a similarity score.** Prompt 76 measured
 * 299–723 ms warm against a scale-to-zero database (AGENTS.md 7.3); a threshold
 * on that is a flake generator and would be a judgement dressed as a
 * measurement (12 rule 4). The band threshold is a recorded product judgement
 * too — the assertion is that *a* band label renders, never that a given query
 * lands in a given band.
 *
 * Every locator is an accessible role or visible text. The class names are
 * settled design output and a test must not pin them.
 */

test.use({ storageState: OWNER_STATE_PATH });

/** Two rows, one `(category, unit)` pair, headers named canonically so the
    alias set in `lib/domain/activity-import.ts` has nothing to guess at.
    `fuel` + `L` because DESNZ publishes many `litres` rows, which is what gives
    the wording search something to rank; the dates sit inside the seeded
    2026 v1.2 set's activity window (`effectiveFrom` 2026-01-01), so the pair is
    calculable rather than out of period. Synthetic throughout — no real site,
    no real quantity, no personal data (AGENTS.md 8.3). */
const CSV_FILENAME = "e2e-factor-picker.csv";
const CSV_CONTENT = [
  "site,date,category,description,quantity,unit",
  "E2E Fixture Site,2026-03-31,fuel,Diesel for the fixture generator,100,L",
  "E2E Fixture Site,2026-04-30,fuel,Diesel for the fixture generator,120,L",
  "",
].join("\n");

const PAIR_HREF = "/activity/mappings?category=fuel&unit=L";

/** How long the commit is given to settle. See the assertion that uses it. */
const COMMIT_WAIT = 45_000;

/** The pair's own row in the coverage list. */
function coverageRow(page: Page): Locator {
  return page
    .getByRole("list", { name: "Activity pairs and mapped factors" })
    .getByRole("listitem")
    .filter({ hasText: "fuel · L" })
    .first();
}

/**
 * The pair's coverage row with every digit run blanked.
 *
 * Mapped-or-not, the factor's label, its source and who chose it all survive;
 * the record count does not. That is deliberate: the browser projects run the
 * same walk against the same organisation at the same time, so a count moving
 * between two reads is another project committing, never a mutation the
 * searches caused — which is the only thing this comparison is about.
 */
async function readCoverageState(page: Page): Promise<string> {
  return (await coverageRow(page).innerText()).replace(/\d[\d,]*/g, "#");
}

/**
 * Submits the picker's GET form and waits for the navigation it causes.
 *
 * **Waiting on a URL *pattern* would not wait at all here** — `waitForURL`
 * resolves immediately when the current URL already matches, and every search
 * lands back on `/activity/mappings`. The predicate form compares against the
 * URL the page was on, so it waits for the real thing.
 */
async function searchFor(page: Page, query: string, button: string) {
  const from = page.url();
  await page.getByLabel(/^Search factors for/).fill(query);
  await page.getByRole("button", { name: button }).click();
  await page.waitForURL((url) => url.href !== from);
}

test.describe.serial("the factor picker, on a committed pair", () => {
  /* Shared across the serial chain, which Playwright runs in one worker. */
  let importUrl = "";

  test("stages an import from a CSV the test wrote", async ({ page }) => {
    await page.goto("/activity");

    await page.setInputFiles("#activity-import-file", {
      name: CSV_FILENAME,
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_CONTENT, "utf8"),
    });

    await Promise.all([
      page.waitForURL(/\/activity\/[0-9a-f-]{36}$/),
      page.getByRole("button", { name: "Stage import" }).click(),
    ]);

    importUrl = page.url();

    /* The staged import, as the review view reports it. */
    await expect(
      page.getByRole("heading", { level: 1, name: CSV_FILENAME }),
    ).toHaveCount(1);
    await expect(page.getByText("2 ready").first()).toBeVisible();

    /* The proposed mapping is what the alias set produces: all six canonical
       fields resolved onto the column that carries them, none left for a person
       to fix. The page's own summary sentence first, then the override form's
       six selects, whose values are the resolved indices.

       **Not a `Not mapped` count** — that string is the empty option of every
       one of those six selects, so it is present six times on a fully mapped
       import. Asserting it was zero failed the first run of this file, on the
       test rather than on the application. */
    const mapping = page.getByRole("region", { name: "Column mapping" });
    await expect(
      mapping.getByText("6 of 6 fields are mapped, from a file with 6 columns."),
    ).toBeVisible();

    const columns = ["Site", "Date", "Category", "Description", "Quantity", "Unit"];
    for (const [index, label] of columns.entries()) {
      await expect(
        mapping.getByLabel(new RegExp(`^${label}`)),
        `${label} should resolve to column ${index + 1}`,
      ).toHaveValue(String(index));
    }
  });

  test("commits the staged rows", async ({ page }) => {
    /* The default 30 s test timeout would expire before `COMMIT_WAIT` does,
       which would report the budget as a test timeout rather than as the
       assertion it belongs to. */
    test.setTimeout(120_000);

    expect(importUrl, "the staging test should have run first").not.toBe("");
    await page.goto(importUrl);

    const commit = page.getByRole("region", { name: "Commit or discard" });
    await commit.getByRole("button", { name: "Commit 2 rows" }).click();
    await commit.getByRole("button", { name: "Confirm commit" }).click();

    /**
     * **The committed state is read from the re-rendered page, not from the
     * leaf's result message.** That message lives *inside* the commit section,
     * and `router.refresh()` removes the whole section on the next render — so
     * asserting on it would be a race against the refresh it triggered. What
     * follows is the Server Component's own report of the import's status.
     *
     * **`COMMIT_WAIT` is a wait budget, not an asserted timing.** The commit is
     * one transaction against a scale-to-zero database (AGENTS.md 7.3), the two
     * browser projects run it concurrently, and `router.refresh()` re-renders
     * the whole page afterwards. The default 5 s expired mid-commit — with the
     * button still reading "Committing..." — on both projects on this file's
     * second run. Nothing here claims the commit takes any particular time;
     * asserting one would be a judgement dressed as a measurement (12 rule 4).
     */
    await expect(
      page.getByText("The rows below are part of your activity records."),
    ).toBeVisible({ timeout: COMMIT_WAIT });
    await expect(
      page.getByRole("region", { name: "Commit or discard" }),
    ).toHaveCount(0);
  });

  test("finds a factor by exact text, and by close wording, and refuses an empty wording search", async ({
    page,
  }) => {
    await page.goto(PAIR_HREF);

    /* The picker is reachable at all, which is what the committed import
       bought. */
    await expect(
      page.getByRole("heading", { name: "Choose a factor" }),
    ).toBeVisible();

    const before = await readCoverageState(page);
    const results = page.getByRole("list", {
      name: "Eligible emission factors",
    });

    // -- exact text --------------------------------------------------------
    await searchFor(page, "diesel", "Search exact text");
    await expect(results).toBeVisible();
    await expect(
      results.getByText("Exact text match", { exact: true }).first(),
    ).toBeVisible();

    // -- close wording, on a misspelling -----------------------------------
    await searchFor(page, "diesal", "Find close wording");
    await expect(results).toBeVisible();
    await expect(
      results
        .getByText(/^(Close wording|Weak wording match)$/)
        .first(),
    ).toBeVisible();
    /* The caveat the ranked mode always carries. Its wording is the page's,
       not this file's guess at it. */
    await expect(
      page.getByText(
        "Close-wording ranking compares character groups and can miss synonyms.",
        { exact: false },
      ),
    ).toBeVisible();

    // -- the invalid path --------------------------------------------------
    /* `factorSearchSchema`'s `superRefine` — an empty query in `fuzzy` mode —
       and the branch that renders the message as `role="alert"` and moves focus
       to it. `factor-picker.tsx`'s `searchStatusRef` effect had never been
       exercised by anything before this line. */
    await searchFor(page, "", "Find close wording");

    const refusal = page.getByRole("alert").filter({
      hasText: "Enter a description before finding close wording.",
    });
    await expect(refusal).toBeVisible();

    const focusedText = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    expect(
      focusedText,
      "the refusal should hold focus, not merely be announced",
    ).toContain("Enter a description before finding close wording.");

    // -- and none of it mutated anything -----------------------------------
    /* Search is a GET. The mapping the coverage column reports is the same one
       it reported before the three searches ran. */
    expect(await readCoverageState(page)).toBe(before);
  });
});
