import { expect, test as setup } from "@playwright/test";
import type { APIResponse, Browser } from "@playwright/test";

import {
  closePool,
  countRateLimitRows,
  countTables,
  markEmailVerified,
} from "./support/database";
import {
  fixtureEmail,
  fixtureName,
  generatePassword,
  generateRunId,
  ORPHAN_STATE_PATH,
  OWNER_STATE_PATH,
  type FixtureOrganization,
  type FixtureUser,
  type RunRecord,
  writeRunRecord,
} from "./support/fixture";

/**
 * The authenticated fixture — prompt 74.
 *
 * **Built through the application's own HTTP surface, with exactly one direct
 * database write.** The password is hashed by Better Auth's own hasher, the
 * `account` row is shaped by the library, and the `member` row carrying the
 * `owner` role is created by the organization plugin — because all three are
 * the library's business, and a fixture that hand-writes them stops testing
 * the thing it exists to test the moment the library changes shape. Only
 * `emailVerified` is set directly, and `support/database.ts` says why.
 *
 * The fixture user can do nothing a real signed-in user could not do. In
 * particular `organization/create` runs the real `allowUserToCreateOrganization`
 * gate rather than bypassing it, which is why verification has to happen first.
 */

/** Better Auth's own limit on `/sign-in*` and `/sign-up*` is three requests per
    ten seconds (`api/rate-limiter/index.mjs`, `getDefaultSpecialRules`). This
    run makes exactly three of each, which sits on the boundary — so a 429 is
    honoured rather than treated as a failure. Signing in once per identity and
    reusing `storageState` across the browser projects is what keeps it to
    three; a per-test sign-in would trip the limiter and read as an auth bug. */
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

    const userId = await markEmailVerified(email);

    const signIn = await authPost(
      (data) =>
        context.request.post("/api/auth/sign-in/email", { data, headers }),
      { email, password: input.password },
    );
    expect(signIn.ok(), "sign-in should succeed").toBeTruthy();

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
    }

    if (input.statePath) await context.storageState({ path: input.statePath });
    return { user: { id: userId, email }, organization };
  } finally {
    await context.close();
  }
}

setup("provisions the authenticated fixture", async ({ browser, baseURL }) => {
  setup.setTimeout(180_000);
  expect(baseURL, "playwright.config.ts must define a baseURL").toBeTruthy();

  const runId = generateRunId();
  const password = generatePassword();

  const before = await countTables();
  const rateLimitBefore = await countRateLimitRows();

  const users: FixtureUser[] = [];
  const organizations: FixtureOrganization[] = [];

  /* The owner of the organisation every authenticated walk runs against. */
  const owner = await provision(browser, baseURL!, {
    role: "owner",
    runId,
    password,
    statePath: OWNER_STATE_PATH,
    organization: {
      name: `Aetherfield E2E Owner Org ${runId}`,
      slug: `aetherfield-e2e-owner-${runId}`,
    },
  });
  users.push(owner.user);
  if (owner.organization) organizations.push(owner.organization);

  /* A verified user with no organisation at all — the second branch of
     `requireOrganization`, and the state every ordinary new signup is in. */
  const orphan = await provision(browser, baseURL!, {
    role: "unaffiliated",
    runId,
    password,
    statePath: ORPHAN_STATE_PATH,
    organization: null,
  });
  users.push(orphan.user);

  /* A second organisation under a second owner. Nothing signs into it: it
     exists so the tenant-boundary assertion has something real to be excluded
     from, rather than asserting the absence of a name that never existed. */
  const neighbour = await provision(browser, baseURL!, {
    role: "neighbour",
    runId,
    password,
    organization: {
      name: `Aetherfield E2E Neighbour Org ${runId}`,
      slug: `aetherfield-e2e-neighbour-${runId}`,
    },
  });
  users.push(neighbour.user);
  if (neighbour.organization) organizations.push(neighbour.organization);

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
    before,
    rateLimitBefore,
  };
  writeRunRecord(record);

  await closePool();
});
