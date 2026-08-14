import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import {
  ADMIN_STATE_PATH,
  ORPHAN_STATE_PATH,
  OWNER_STATE_PATH,
  readRunRecord,
  STAFF_STATE_PATH,
} from "./support/fixture";

/**
 * `/submissions` and Aetherfield's own staff roles, walked in a browser —
 * prompt 78.
 *
 * Prompt 74 built the authenticated fixture and named this gap; prompt 77
 * walked the factor picker and named it again, unchanged. It is the last
 * authenticated surface with no browser-level verification, and of everything
 * behind a gate in this repository it is the surface that matters most:
 * `/submissions` is the only route that reads leads, subscribers, applications
 * and verified accounts, and `/submissions/applications/[id]/cv` is the only
 * route that mints a signed URL for a CV. That is every category of personal
 * data AGENTS.md 8.3 governs, behind one gate —
 * `requireSubmissionsAccount` — whose second branch, a signed-in caller
 * *without* a staff role, no test had ever entered.
 *
 * **This walk reads a real database holding real people's data, and that shapes
 * every assertion in the file.** Nothing here reads a row's contents: not a
 * name, not an address, not an employer, not a message body. What is asserted
 * is headings, view labels, control presence, the pagination sentence's shape
 * and the count of rows against the count of controls. The one exception is the
 * fixture's own run-scoped `example.com` addresses, which are this run's and
 * cannot reach a person (RFC 2606).
 *
 * **`removeSubmission` is never invoked, from any session.** It soft-deletes a
 * real lead, subscriber or application, and for an application it deletes the
 * CV blob. The control's presence is asserted; the control is not operated. The
 * only mutation this file performs is the grant and revoke at the bottom, on a
 * row the fixture created for exactly that purpose.
 *
 * The run record is read *inside* each test that needs it: Playwright
 * enumerates every test file before the setup project runs, so nothing may read
 * it at module scope.
 */

/** Well-formed and certainly absent, so the CV page's own not-found path is
    what answers — not `submissionIdSchema`, and not the gate. */
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

/** Rejected by `submissionIdSchema` (`z.uuid()`) before any store is reached. */
const MALFORMED_ID = "not-a-uuid";

const ABSENT_CV = `/submissions/applications/${ABSENT_ID}/cv`;

/** A streamed page can commit its `loading.tsx` shell before the database-backed
    role check finishes. This is a wait budget for the asserted destination,
    not a performance threshold: Neon can be cold and local TCP attempts can
    consume several seconds before succeeding. */
const ROLE_GATE_WAIT = 20_000;

/** The three views every staff account may see, with the `aria-label` each
    list carries. `staff` is deliberately absent: it is the admin-only one. */
const STAFF_VIEWS = [
  { view: "leads", heading: "Leads", list: "Demo requests" },
  { view: "subscribers", heading: "Subscribers", list: "Newsletter subscribers" },
  { view: "applications", heading: "Applications", list: "Job applications" },
] as const;

function viewNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Submission views" });
}

/** The heading the page gives the view it actually rendered — which is not
    always the view that was asked for, and that difference is the point of
    several cases below. */
function renderedView(page: Page): Locator {
  return page.getByRole("heading", { level: 2 }).first();
}

/**
 * How many rows the current view rendered.
 *
 * Zero is an ordinary answer: the list element is not rendered at all when a
 * view is empty (`EmptyState` takes its place), and on a real database any of
 * the three may legitimately be empty. **Nothing here reads what is in a row**
 * — only how many there are, so the control count can be compared against it.
 */
async function rowCount(page: Page, listLabel: string): Promise<number> {
  const list = page.getByRole("list", { name: listLabel });
  if ((await list.count()) === 0) return 0;
  return list.getByRole("listitem").count();
}

function removeControls(page: Page): Locator {
  return page.getByRole("button", { name: "Remove", exact: true });
}

/**
 * "The sign-in page, carrying exactly this callback."
 *
 * A predicate rather than a regex over the encoded query, so the assertion says
 * what it means and cannot drift into asserting one particular escaping of a
 * slash or an ampersand instead of the value itself.
 */
function signInCarrying(callbackURL: string): (url: URL) => boolean {
  return (url) =>
    url.pathname === "/sign-in" &&
    url.searchParams.get("callbackURL") === callbackURL;
}

/** A verified account's row on the staff view, addressed by the fixture's own
    synthetic address. */
function accountRow(page: Page, email: string): Locator {
  return page
    .getByRole("list", { name: "Verified accounts" })
    .getByRole("listitem")
    .filter({ hasText: email });
}

/* ---------------------------------------------------------------------------
   The gate — `requireSubmissionsAccount`, and the proxy in front of it
   ------------------------------------------------------------------------ */

test.describe("a caller with no session", () => {
  test("is sent from /submissions to sign-in", async ({ page }) => {
    await page.goto("/submissions");

    await expect(page).toHaveURL(signInCarrying("/submissions"));
  });

  test("is sent from an application CV to sign-in", async ({ page }) => {
    await page.goto(ABSENT_CV);

    /* The CV route is matched by `proxy.ts`'s `/submissions/:path*` like the
       index is, so the turn-away happens before the id is ever looked at. */
    await expect(page).toHaveURL(signInCarrying(ABSENT_CV));
  });
});

/**
 * `requestedCallback`, which a plain signed-out request never reaches.
 *
 * **Worth stating, because it is not what the route looks like it does.** For a
 * caller with no cookie at all, `proxy.ts` answers first and builds the
 * `callbackURL` itself from `pathname + search`; `SubmissionsPage` never runs,
 * so `requestedCallback` never runs either. The one caller that gets past the
 * proxy and still fails `getCurrentAccount()` is the one holding a cookie that
 * exists but does not validate — AGENTS.md 7.3's `getSessionCookie()` trap,
 * which `e2e/authenticated.spec.ts` already asserts on `/dashboard`. That is
 * the branch where `requestedCallback` is observable, and it is the only one,
 * so it is where its round-trip is asserted.
 */
test("round-trips a query-carrying URL through requestedCallback", async ({
  browser,
  baseURL,
}) => {
  type SavedState = Awaited<ReturnType<BrowserContext["storageState"]>>;
  const saved = JSON.parse(readFileSync(ADMIN_STATE_PATH, "utf8")) as SavedState;

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
    await page.goto("/submissions?view=applications&page=2");

    /* Both parameters survive, in order, re-encoded once as the single
       `callbackURL` value. A forged cookie reaching the staff workspace and
       being turned away by the database-backed check is the assertion; the
       round-trip is what it carries. */
    await expect(page).toHaveURL(
      signInCarrying("/submissions?view=applications&page=2"),
      { timeout: ROLE_GATE_WAIT },
    );
  } finally {
    await context.close();
  }
});

/**
 * The branch no test had entered: a verified, signed-in user with no staff
 * role. Both identities meet it, and they differ in the thing that is *not*
 * deciding it — the owner belongs to an organisation and the orphan belongs to
 * none, and both are sent to the same place. AGENTS.md 11.1's roles are
 * orthogonal to tenant membership, and this is that stated as a test.
 */
for (const [label, statePath] of [
  ["an organisation owner", OWNER_STATE_PATH],
  ["a user in no organisation", ORPHAN_STATE_PATH],
] as const) {
  test.describe(`${label}, holding no staff role`, () => {
    test.use({ storageState: statePath });

    test("is sent from /submissions to the account page, not to sign-in", async ({
      page,
    }) => {
      await page.goto("/submissions");

      await expect(page).toHaveURL(/\/account$/, { timeout: ROLE_GATE_WAIT });
      await expect(page).not.toHaveURL(/\/sign-in/);
    });

    test("is sent from an application CV to the account page", async ({
      page,
    }) => {
      /* The same gate runs before the CV page parses anything, so an absent id
         is answered by the role check rather than by the not-found branch. */
      await page.goto(ABSENT_CV);

      await expect(page).toHaveURL(/\/account$/, { timeout: ROLE_GATE_WAIT });
      await expect(page).not.toHaveURL(/\/sign-in/);
    });
  });
}

/* ---------------------------------------------------------------------------
   The role difference — staff versus admin
   ------------------------------------------------------------------------ */

test.describe("a staff account", () => {
  test.use({ storageState: STAFF_STATE_PATH });

  test("reaches the workspace, with three views and no Staff view", async ({
    page,
  }) => {
    const response = await page.goto("/submissions");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Submissions, clearly in view." }),
    ).toHaveCount(1);

    for (const { heading } of STAFF_VIEWS) {
      await expect(viewNav(page).getByRole("link", { name: heading })).toHaveCount(1);
    }
    await expect(
      viewNav(page).getByRole("link", { name: "Staff", exact: true }),
      "the Staff view is admin-only and must not be offered",
    ).toHaveCount(0);
  });

  test("asking for the Staff view is given the leads view instead", async ({
    page,
  }) => {
    /* `SubmissionsPage`'s `parsedView === "staff" && account.role !== "admin"`
       fallback. The fallback is the assertion — the status is not, because
       `app/submissions/loading.tsx` commits it before the page body runs. */
    await page.goto("/submissions?view=staff");

    await expect(renderedView(page)).toHaveText("Leads");
    await expect(
      viewNav(page).getByRole("link", { name: "Staff", exact: true }),
    ).toHaveCount(0);
  });

  for (const { view, heading, list } of STAFF_VIEWS) {
    test(`renders ${view} with no removal controls`, async ({ page }) => {
      await page.goto(`/submissions?view=${view}`);

      await expect(renderedView(page)).toHaveText(heading);
      /* Read so the count is meaningful: "no controls" only says something
         once we know whether there was anything to control. */
      const rows = await rowCount(page, list);
      await expect(
        removeControls(page),
        `staff must see no removal control over ${rows} ${view} rows`,
      ).toHaveCount(0);
    });
  }

  test("falls back to the leads view and page 1 on unparseable parameters", async ({
    page,
  }) => {
    /* `parseSubmissionView` and `parseSubmissionPage` both fall back totally
       rather than erroring, which is what makes these safe as public query
       parameters at all. */
    await page.goto("/submissions?view=not-a-view&page=not-a-page");

    await expect(renderedView(page)).toHaveText("Leads");
    await expect(
      page.getByText(/^Page 1 of \d+ · \d+ total$/),
      "the pagination sentence should report page 1",
    ).toBeVisible();
  });
});

test.describe("an admin account", () => {
  test.use({ storageState: ADMIN_STATE_PATH });

  test("reaches the workspace, with four views including Staff", async ({
    page,
  }) => {
    const response = await page.goto("/submissions");

    expect(response?.status()).toBe(200);
    for (const heading of ["Leads", "Subscribers", "Applications", "Staff"]) {
      await expect(
        viewNav(page).getByRole("link", { name: heading, exact: true }),
      ).toHaveCount(1);
    }
  });

  for (const { view, heading, list } of STAFF_VIEWS) {
    test(`renders ${view} with one removal control per row`, async ({ page }) => {
      await page.goto(`/submissions?view=${view}`);

      await expect(renderedView(page)).toHaveText(heading);

      /**
       * **Asserted as a count against the rows, not as "a control is
       * present".** This walk runs against the project's one real database and
       * any of the three views may legitimately hold nothing, so asserting
       * presence outright would pass or fail on what happens to be in the table
       * rather than on the role. One control per rendered row says the whole
       * thing — and paired with the staff case above, which reports zero over
       * however many rows it saw, it is the role difference exactly.
       *
       * Nothing is read out of a row to count it.
       */
      const rows = await rowCount(page, list);
      await expect(
        removeControls(page),
        `an admin should see one removal control for each of the ${rows} ${view} rows`,
      ).toHaveCount(rows);
    });
  }

  test("falls back to the leads view and page 1 on unparseable parameters", async ({
    page,
  }) => {
    await page.goto("/submissions?view=not-a-view&page=not-a-page");

    await expect(renderedView(page)).toHaveText("Leads");
    await expect(page.getByText(/^Page 1 of \d+ · \d+ total$/)).toBeVisible();
  });

  test("offers no role control on its own row", async ({ page }) => {
    /* `StaffList` takes `actingAdminId`, and `setStaffRole`'s WHERE carries
       `ne(user.id, actorId)` behind it — so the UI and the query agree that an
       admin cannot act on itself. The control's absence is what is asserted
       here; the query's half is not reachable from a browser without one. */
    const record = readRunRecord();
    await page.goto("/submissions?view=staff");

    const row = accountRow(page, record.adminUser.email);
    await expect(row, "the acting admin should be listed").toHaveCount(1);
    await expect(row).toContainText("Admin");
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  /**
   * The one mutation this walk performs, through the application's own path.
   *
   * **The target is this project's own**, because the browser projects run in
   * parallel against one database and a shared target would produce a flake
   * that reads as an authorisation bug.
   *
   * **The target is on page 1 because the run created it and
   * `listVerifiedAccounts` orders by `created_at desc`** — stated because it is
   * a real dependency. If a concurrent real signup ever displaced it this test
   * fails loudly, which is the right failure.
   *
   * The row's *rendered* role is read after a reload rather than from the
   * control's own message: `changeStaffRole` calls `revalidatePath`, but
   * `StaffRoleControl` does not refresh the router, so the server's view of the
   * row is what a fresh render reports — which is the thing worth asserting.
   */
  test("grants and revokes staff on its own project's target", async ({
    page,
  }, testInfo) => {
    const record = readRunRecord();
    const target = record.grantTargets[testInfo.project.name];
    expect(
      target,
      `setup should have provisioned a grant target for ${testInfo.project.name}`,
    ).toBeTruthy();

    await page.goto("/submissions?view=staff");

    const row = accountRow(page, target.email);
    await expect(row, "the grant target should be on page 1").toHaveCount(1);
    await expect(row, "it starts with no role at all").toContainText("Customer");

    // -- grant -------------------------------------------------------------
    await row.getByRole("button", { name: "Grant staff" }).click();
    await expect(row.getByRole("status")).toHaveText(/^Staff access granted to /);

    await page.reload();
    await expect(row).not.toContainText("Customer");
    await expect(
      row.getByRole("button", { name: "Revoke staff" }),
      "the server should now render the row as staff",
    ).toBeVisible();

    // -- and back ----------------------------------------------------------
    /* The target is left exactly as setup provisioned it, with no role. */
    await row.getByRole("button", { name: "Revoke staff" }).click();
    await expect(row.getByRole("status")).toHaveText(/^Staff access revoked for /);

    await page.reload();
    await expect(row).toContainText("Customer");
    await expect(row.getByRole("button", { name: "Grant staff" })).toBeVisible();
  });
});

/* ---------------------------------------------------------------------------
   The CV path
   ------------------------------------------------------------------------ */

test.describe("the CV route, from a staff session", () => {
  test.use({ storageState: STAFF_STATE_PATH });

  for (const [label, id] of [
    ["an absent id", ABSENT_ID],
    ["a malformed id", MALFORMED_ID],
  ] as const) {
    test(`answers ${label} with the not-found page, past the gate`, async ({
      page,
    }) => {
      const response = await page.goto(
        `/submissions/applications/${id}/cv`,
      );

      /* Past the gate is half the assertion: neither redirect fired, so the
         staff role was accepted and the page's own branch is what answered.
         For the malformed id that branch is `submissionIdSchema`, which runs
         before `getLiveApplicationCv` — so a malformed id never reaches the
         database or the blob store. */
      await expect(page).not.toHaveURL(/\/sign-in/);
      await expect(page).not.toHaveURL(/\/account$/);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "That application isn't available.",
        }),
      ).toHaveCount(1);

      /**
       * **Observed and reported, not asserted.** Prompt 74's finding 1 recorded
       * that a `loading.tsx` above a route flushes the shell and commits the
       * status before `notFound()` runs inside it, so `/reports/[reportId]`
       * answers an absent report at 200 where `/activity/[importId]` answers
       * 404. `app/submissions/loading.tsx` exists, so this route is a candidate
       * for the same effect. Locking the status in either direction here would
       * either enshrine a known open finding or fail on the fix; the measured
       * value is recorded in `docs/backend.md` instead.
       */
      /* The only line this file logs. A case label and an HTTP status — no id,
         no address, and nothing read out of a row (8.3 rule 2). */
      console.log(
        `[e2e] submissions CV route, ${label}: HTTP ${response?.status()}`,
      );
    });
  }
});
