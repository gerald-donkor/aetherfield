import { existsSync, rmSync } from "node:fs";

import { expect, test as teardown } from "@playwright/test";

import {
  closePool,
  countRateLimitRows,
  countTables,
  removeFixture,
} from "./support/database";
import {
  AUTH_DIR,
  COUNTED_TABLES,
  RUN_RECORD_PATH,
  readRunRecord,
} from "./support/fixture";

/**
 * Teardown is part of the deliverable, not a nicety — prompt 74.
 *
 * `npm run test:e2e` must leave the database as it found it, and the proof is
 * a readback rather than a claim: the setup project counted every relation it
 * could reach before writing anything, and this project counts them again
 * after the deletes and asserts the deltas are zero. A leftover row fails the
 * run rather than sitting in the database unnoticed.
 */
teardown("removes the authenticated fixture", async () => {
  teardown.setTimeout(120_000);

  if (!existsSync(RUN_RECORD_PATH)) {
    /* Setup never got far enough to write a record, so there is nothing this
       project can identify. Say so; do not pretend the database is clean. */
    throw new Error(
      "No fixture record was written, so no fixture rows can be identified for removal.",
    );
  }

  const record = readRunRecord();

  try {
    await removeFixture(record);

    const after = await countTables();
    for (const name of COUNTED_TABLES) {
      expect(
        after[name],
        `${name} should hold the same number of rows as before the run`,
      ).toBe(record.before[name]);
    }

    /* Reported, never asserted: `rate_limit` rows are keyed by `<ip>|<path>`
       and carry no user reference, so this run's are indistinguishable from
       any other local request's. Better Auth prunes them once the window has
       passed. See `support/database.ts`. */
    const rateLimitAfter = await countRateLimitRows();
    console.log(
      `[e2e] rate_limit rows: ${record.rateLimitBefore} before, ${rateLimitAfter} after (not restored — keyed by ip and path, self-pruning).`,
    );
  } finally {
    await closePool();
    /* The saved sessions are credentials. Remove them with the rows they
       authenticate against, so a stale cookie cannot outlive its user. */
    rmSync(AUTH_DIR, { recursive: true, force: true });
  }
});
