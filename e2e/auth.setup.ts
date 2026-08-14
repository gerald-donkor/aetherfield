import { expect, test as setup } from "@playwright/test";
import type { APIResponse, Browser } from "@playwright/test";

import {
  closePool,
  countRateLimitRows,
  countTables,
  markEmailVerified,
  setStaffRoleDirectly,
} from "./support/database";
import {
  ADMIN_STATE_PATH,
  browserProjectNames,
  type FixtureCleanupRecord,
  fixtureEmail,
  fixtureName,
  generatePassword,
  generateRunId,
  ORPHAN_STATE_PATH,
  OWNER_STATE_PATH,
  STAFF_STATE_PATH,
  type FixtureOrganization,
  type FixtureUser,
  type RunRecord,
  writeCleanupRecord,
  writeRunRecord,
} from "./support/fixture";

/**
 * The authenticated fixture — prompt 74.
 *
 * **Built through the application's own HTTP surface, with exactly two narrow
 * direct database writes.** The password is hashed by Better Auth's own hasher, the
 * `account` row is shaped by the library, and the `member` row carrying the
 * `owner` role is created by the organization plugin — because all three are
 * the library's business, and a fixture that hand-writes them stops testing
 * the thing it exists to test the moment the library changes shape. Only
 * `emailVerified` and the fixture-owned staff role are set directly, and
 * `support/database.ts` says why each exception is necessary and narrow.
 *
 * The fixture user can do nothing a real signed-in user could not do. In
 * particular `organization/create` runs the real `allowUserToCreateOrganization`
 * gate rather than bypassing it, which is why verification has to happen first.
 */

/**
 * Better Auth's own limit on `/sign-in*` and `/sign-up*` is three requests per
 * ten seconds (`api/rate-limiter/index.mjs`, `getDefaultSpecialRules`), keyed
 * by `<ip>|<path>` so the two paths carry separate counters. A 429 is honoured
 * rather than treated as a failure. Signing in once per identity and reusing
 * `storageState` across the browser projects is what keeps the count down; a
 * per-test sign-in would trip the limiter and read as an auth bug.
 *
 * **Prompt 78 pushed this past the boundary and the retry is now load-bearing,
 * so the arithmetic is stated rather than assumed.** The run makes one sign-up
 * per identity — three from prompt 74, plus `admin`, `staff` and one grant
 * target per browser project — and signs in only for the identities that need
 * a session or an organisation, which the grant targets do not.
 *
 * The two retries are a defensive ceiling; one blocked call should consume at
 * most one. That is a property of the limiter rather than a hope:
 * `decideConsume` leaves `lastRequest` untouched when it refuses (`next:
 * data`), so a blocked request does not extend the window it was blocked by,
 * and the next call after `X-Retry-After` seconds resets the counter to one.
 * Verified against `node_modules/better-auth` this session.
 */
const RATE_LIMIT_RETRIES = 2;

async function authPost(
  post: (body: unknown) => Promise<APIResponse>,
  body: unknown,
): Promise<APIResponse> {
  let response = await post(body);

  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt += 1) {
    if (response.status() !== 429) break;
    const retryAfter = Number(response.headers()["x-retry-after"] ?? 10);
    await new Promise((resolve) =>
      setTimeout(resolve, (Number.isFinite(retryAfter) ? retryAfter : 10) * 1000 + 500),
    );
    response = await post(body);
  }

  return response;
}

type Provisioned = {
  user: FixtureUser;
  organization: FixtureOrganization | null;
};

async function provision(
  browser: Browser,
  baseURL: string,
  input: {
    role: string;
    runId: string;
    password: string;
    statePath?: string;
    organization: { name: string; slug: string } | null;
    /** Prompt 78 — the one role the application cannot grant itself. Written
        directly, and `support/database.ts` says why. */
    staffRole?: "staff" | "admin";
    /** Exact ids are journalled as soon as the application creates them, so a
        later setup failure can still be cleaned without an address-pattern
        sweep. */
    cleanup: FixtureCleanupRecord;
  },
): Promise<Provisioned> {
  const email = fixtureEmail(input.role, input.runId);
  const context = await browser.newContext({ baseURL });

  /* Better Auth validates the `origin` header against its trusted origins
     whenever the request carries a cookie, and `BETTER_AUTH_URL` is what seeds
     that list. The test server is started with it set to this origin
     (`playwright.config.ts`); the header is sent explicitly so the check is
     exercised rather than skipped by its absence. */
  const headers = { origin: baseURL, "content-type": "application/json" };

  try {
    const signUp = await authPost(
      (data) =>
        context.request.post("/api/auth/sign-up/email", { data, headers }),
      { name: fixtureName(input.role), email, password: input.password },
    );
    expect(signUp.ok(), "sign-up should succeed").toBeTruthy();

    const signUpPayload = (await signUp.json()) as {
      user?: { id?: unknown };
    };
    const responseUserId = signUpPayload.user?.id;
    expect(
      typeof responseUserId === "string" && responseUserId.length > 0,
      "sign-up should return the created user's id",
    ).toBeTruthy();

    const user = { id: responseUserId as string, email };
    input.cleanup.users.push(user);
    writeCleanupRecord(input.cleanup);

    const userId = await markEmailVerified(email);
    expect(userId, "the verified row should be the signed-up user").toBe(user.id);
    if (input.staffRole) await setStaffRoleDirectly(userId, input.staffRole);

    /* Only the identities that need one sign in. A grant target is a row the
       admin session acts *on*, never a caller, so signing it in would spend
       limiter budget (above) on a session nothing ever uses. */
    if (input.statePath || input.organization) {
      const signIn = await authPost(
        (data) =>
          context.request.post("/api/auth/sign-in/email", { data, headers }),
        { email, password: input.password },
      );
      expect(signIn.ok(), "sign-in should succeed").toBeTruthy();
    }

    let organization: FixtureOrganization | null = null;
    if (input.organization) {
      const created = await authPost(
        (data) =>
          context.request.post("/api/auth/organization/create", {
            data,
            headers,
          }),
        input.organization,
      );
      expect(created.ok(), "organization creation should succeed").toBeTruthy();
      const payload = (await created.json()) as { id: string };
      organization = { id: payload.id, ...input.organization };
      input.cleanup.organizations.push(organization);
      writeCleanupRecord(input.cleanup);
    }

    if (input.statePath) await context.storageState({ path: input.statePath });
    return { user, organization };
  } finally {
    await context.close();
  }
}

setup("provisions the authenticated fixture", async ({ browser, baseURL }) => {
  /* Prompt 74 allowed 180 s for three identities. Prompt 78 provisions five
     more and the sign-up limiter now costs the run two ~10 s waits it did not
     pay before (see `RATE_LIMIT_RETRIES`), so the budget is widened rather
     than left to expire on a wait the fixture deliberately takes. This is a
     budget, not an asserted timing — the database is scale-to-zero. */
  setup.setTimeout(300_000);
  expect(baseURL, "playwright.config.ts must define a baseURL").toBeTruthy();

  const runId = generateRunId();
  const password = generatePassword();

  const before = await countTables();
  const rateLimitBefore = await countRateLimitRows();

  const users: FixtureUser[] = [];
  const organizations: FixtureOrganization[] = [];
  const cleanup: FixtureCleanupRecord = {
    users,
    organizations,
    before,
    rateLimitBefore,
  };
  /* Exists before the first sign-up. Each successful creation rewrites it
     immediately with the exact id returned by Better Auth. */
  writeCleanupRecord(cleanup);

  /* The owner of the organisation every authenticated walk runs against. */
  const owner = await provision(browser, baseURL!, {
    role: "owner",
    runId,
    password,
    cleanup,
    statePath: OWNER_STATE_PATH,
    organization: {
      name: `Aetherfield E2E Owner Org ${runId}`,
      slug: `aetherfield-e2e-owner-${runId}`,
    },
  });

  /* A verified user with no organisation at all — the second branch of
     `requireOrganization`, and the state every ordinary new signup is in. */
  await provision(browser, baseURL!, {
    role: "unaffiliated",
    runId,
    password,
    cleanup,
    statePath: ORPHAN_STATE_PATH,
    organization: null,
  });

  /* A second organisation under a second owner. Nothing signs into it: it
     exists so the tenant-boundary assertion has something real to be excluded
     from, rather than asserting the absence of a name that never existed. */
  const neighbour = await provision(browser, baseURL!, {
    role: "neighbour",
    runId,
    password,
    cleanup,
    organization: {
      name: `Aetherfield E2E Neighbour Org ${runId}`,
      slug: `aetherfield-e2e-neighbour-${runId}`,
    },
  });

  /* Aetherfield's own two staff roles — AGENTS.md 11.1, prompt 78. Neither is
     a member of any organisation, which is the orthogonality 11.1 states: a
     staff member is not thereby a tenant, and the walk asserts the submissions
     gate rather than any tenant read. */
  const admin = await provision(browser, baseURL!, {
    role: "admin",
    runId,
    password,
    cleanup,
    statePath: ADMIN_STATE_PATH,
    organization: null,
    staffRole: "admin",
  });

  const staff = await provision(browser, baseURL!, {
    role: "staff",
    runId,
    password,
    cleanup,
    statePath: STAFF_STATE_PATH,
    organization: null,
    staffRole: "staff",
  });

  /* One grant target per browser project. Ordinary verified accounts with no
     role at all — the state a public sign-up leaves a user in (11.2 rule 3) —
     and the rows `StaffRoleControl` acts on. One each, because the projects run
     in parallel against one database; `support/fixture.ts` says why. */
  const grantTargets: Record<string, FixtureUser> = {};
  for (const projectName of browserProjectNames()) {
    const target = await provision(browser, baseURL!, {
      role: `grant-${projectName}`,
      runId,
      password,
      cleanup,
      organization: null,
    });
    grantTargets[projectName] = target.user;
  }

  expect(owner.organization, "the owner fixture must hold an organisation").toBeTruthy();
  expect(
    neighbour.organization,
    "the neighbour fixture must hold an organisation",
  ).toBeTruthy();

  const record: RunRecord = {
    runId,
    users,
    organizations,
    ownerOrganization: owner.organization!,
    neighbourOrganization: neighbour.organization!,
    adminUser: admin.user,
    staffUser: staff.user,
    grantTargets,
    before,
    rateLimitBefore,
  };
  writeRunRecord(record);

  await closePool();
});
