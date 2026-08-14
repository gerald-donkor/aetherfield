import { existsSync, rmSync } from "node:fs";

import { expect, test as teardown } from "@playwright/test";

import {
  closePool,
  countRateLimitRows,
  countTables,
  removeFixture,
} from "./support/database";
import {
  ADMIN_STATE_PATH,
  AUTH_DIR,
  CLEANUP_RECORD_PATH,
  COUNTED_TABLES,
  ORPHAN_STATE_PATH,
  OWNER_STATE_PATH,
  RUN_RECORD_PATH,
  readRunRecord,
  readCleanupRecord,
  STAFF_STATE_PATH,
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

  if (!existsSync(RUN_RECORD_PATH) && !existsSync(CLEANUP_RECORD_PATH)) {
    /* Setup never got far enough to write even the incremental record, so no
       fixture row was created and there is nothing exact to target. */
    throw new Error(
      "No fixture or cleanup record was written, so no fixture rows can be identified for removal.",
    );
  }

  const record = existsSync(RUN_RECORD_PATH)
    ? readRunRecord()
    : readCleanupRecord();
  let cleaned = false;

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
    cleaned = true;
  } finally {
    await closePool();
    if (cleaned) {
      /* The saved sessions are credentials. Remove them with the rows they
         authenticate against, so a stale cookie cannot outlive its user. */
      rmSync(AUTH_DIR, { recursive: true, force: true });
    } else {
      /* A failed delete keeps the two non-secret id journals so teardown can
         be retried exactly. Live session files are still credentials and are
         removed immediately; no stale cookie survives the failed cleanup. */
      for (const statePath of [
        OWNER_STATE_PATH,
        ORPHAN_STATE_PATH,
        ADMIN_STATE_PATH,
        STAFF_STATE_PATH,
      ]) {
        rmSync(statePath, { force: true });
      }
    }
  }
});
