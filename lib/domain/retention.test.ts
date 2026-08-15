import { describe, expect, it } from "vitest";

import {
  RETENTION_WINDOWS,
  RETENTION_WINDOW_TEXT,
  isApplicationDue,
  isLeadDue,
  isSubscriberDue,
  retentionCutoffs,
} from "./retention";

/**
 * The retention cut-offs — prompt 81.
 *
 * Every case supplies its own clock, which is what `lib/domain/` being pure
 * buys: no database, no browser, no mock (AGENTS.md 2's note on what `npm test`
 * is scoped to). Both sides of every boundary are pinned, because a window that
 * is a day out deletes a person's data a day early and there is no undo.
 */

/** A fixed instant, mid-month so no window's arithmetic is accidentally
    boundary-free, and at 04:00 UTC — the hour the sweep is scheduled for. */
const NOW = new Date("2026-08-15T04:00:00.000Z");

const SECOND = 1000;

/** One second later than `at` — inside the window, so not yet due. */
const justAfter = (at: Date) => new Date(at.getTime() + SECOND);
/** One second earlier than `at` — past the window, so due. */
const justBefore = (at: Date) => new Date(at.getTime() - SECOND);

describe("retentionCutoffs", () => {
  it("subtracts calendar months in UTC for the month windows", () => {
    const cutoffs = retentionCutoffs(NOW);
    expect(cutoffs.lead.toISOString()).toBe("2024-08-15T04:00:00.000Z");
    expect(cutoffs.application.toISOString()).toBe("2025-08-15T04:00:00.000Z");
    expect(cutoffs.unsubscribedSubscriber.toISOString()).toBe(
      "2025-08-15T04:00:00.000Z",
    );
  });

  it("subtracts exact 24-hour days for the day windows", () => {
    const cutoffs = retentionCutoffs(NOW);
    expect(cutoffs.pendingSubscriber.toISOString()).toBe(
      "2026-07-16T04:00:00.000Z",
    );
    expect(cutoffs.softDelete.toISOString()).toBe("2026-07-16T04:00:00.000Z");
  });

  it("clamps a short target month rather than rolling into the next one", () => {
    /* 2028 is a leap year, 2027 and 2026 are not. A naive `setUTCMonth` would
       give 1 March; the window must land on the 28th. */
    const leapDay = new Date("2028-02-29T04:00:00.000Z");
    const cutoffs = retentionCutoffs(leapDay);
    expect(cutoffs.application.toISOString()).toBe("2027-02-28T04:00:00.000Z");
    expect(cutoffs.lead.toISOString()).toBe("2026-02-28T04:00:00.000Z");
  });

  it("crosses a year boundary without drifting", () => {
    const january = new Date("2026-01-31T23:59:59.000Z");
    const cutoffs = retentionCutoffs(january);
    /* 31 January minus 12 months is 31 January, not a clamped 30th. */
    expect(cutoffs.application.toISOString()).toBe("2025-01-31T23:59:59.000Z");
    expect(cutoffs.lead.toISOString()).toBe("2024-01-31T23:59:59.000Z");
  });

  it("states the same windows in words as in numbers", () => {
    expect(RETENTION_WINDOWS.leadMonths).toBe(24);
    expect(RETENTION_WINDOW_TEXT.lead).toBe("24 months");
    expect(RETENTION_WINDOWS.applicationMonths).toBe(12);
    expect(RETENTION_WINDOW_TEXT.application).toBe("12 months");
    expect(RETENTION_WINDOWS.pendingSubscriberDays).toBe(30);
    expect(RETENTION_WINDOW_TEXT.pendingSubscriber).toBe("30 days");
    expect(RETENTION_WINDOWS.unsubscribedSubscriberMonths).toBe(12);
    expect(RETENTION_WINDOW_TEXT.unsubscribedSubscriber).toBe("12 months");
  });
});

describe("isLeadDue", () => {
  const cutoff = retentionCutoffs(NOW).lead;

  it("is due exactly on the boundary", () => {
    expect(isLeadDue({ createdAt: cutoff, deletedAt: null }, NOW)).toBe(true);
  });

  it("is due one second past it", () => {
    expect(
      isLeadDue({ createdAt: justBefore(cutoff), deletedAt: null }, NOW),
    ).toBe(true);
  });

  it("is not due one second short of it", () => {
    expect(
      isLeadDue({ createdAt: justAfter(cutoff), deletedAt: null }, NOW),
    ).toBe(false);
  });

  it("is not due for a lead captured today", () => {
    expect(isLeadDue({ createdAt: NOW, deletedAt: null }, NOW)).toBe(false);
  });
});

describe("isApplicationDue", () => {
  const cutoff = retentionCutoffs(NOW).application;

  it("is due exactly on the boundary", () => {
    expect(isApplicationDue({ createdAt: cutoff, deletedAt: null }, NOW)).toBe(
      true,
    );
  });

  it("is not due one second short of it", () => {
    expect(
      isApplicationDue({ createdAt: justAfter(cutoff), deletedAt: null }, NOW),
    ).toBe(false);
  });

  it("does not use the lead's longer window", () => {
    const elevenMonths = new Date("2025-09-15T04:00:00.000Z");
    expect(
      isApplicationDue({ createdAt: elevenMonths, deletedAt: null }, NOW),
    ).toBe(false);
    expect(isLeadDue({ createdAt: elevenMonths, deletedAt: null }, NOW)).toBe(
      false,
    );
    const thirteenMonths = new Date("2025-07-15T04:00:00.000Z");
    expect(
      isApplicationDue({ createdAt: thirteenMonths, deletedAt: null }, NOW),
    ).toBe(true);
    expect(isLeadDue({ createdAt: thirteenMonths, deletedAt: null }, NOW)).toBe(
      false,
    );
  });
});

describe("the soft-delete window", () => {
  const soft = retentionCutoffs(NOW).softDelete;
  /* Captured today, so no age window of its own can be what makes it due. */
  const fresh = NOW;

  it("makes a young lead due once the grace has elapsed", () => {
    expect(isLeadDue({ createdAt: fresh, deletedAt: soft }, NOW)).toBe(true);
    expect(
      isLeadDue({ createdAt: fresh, deletedAt: justAfter(soft) }, NOW),
    ).toBe(false);
  });

  it("makes a young application due once the grace has elapsed", () => {
    expect(isApplicationDue({ createdAt: fresh, deletedAt: soft }, NOW)).toBe(
      true,
    );
    expect(
      isApplicationDue({ createdAt: fresh, deletedAt: justAfter(soft) }, NOW),
    ).toBe(false);
  });

  it("makes a confirmed subscriber due — the only thing that can", () => {
    expect(
      isSubscriberDue(
        {
          status: "confirmed",
          createdAt: fresh,
          unsubscribedAt: null,
          deletedAt: soft,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("never lengthens a record's life — the age window still wins", () => {
    /* Long past its 24 months, soft-deleted a minute ago. The two predicates
       are or-ed, so the age window still makes it due. */
    const old = new Date("2020-01-01T00:00:00.000Z");
    expect(
      isLeadDue({ createdAt: old, deletedAt: new Date(NOW.getTime() - 60000) }, NOW),
    ).toBe(true);
  });
});

describe("isSubscriberDue", () => {
  const cutoffs = retentionCutoffs(NOW);

  it("ages a pending address out at 30 days from created_at", () => {
    const base = {
      status: "pending" as const,
      unsubscribedAt: null,
      deletedAt: null,
    };
    expect(
      isSubscriberDue({ ...base, createdAt: cutoffs.pendingSubscriber }, NOW),
    ).toBe(true);
    expect(
      isSubscriberDue(
        { ...base, createdAt: justAfter(cutoffs.pendingSubscriber) },
        NOW,
      ),
    ).toBe(false);
    expect(
      isSubscriberDue(
        { ...base, createdAt: justBefore(cutoffs.pendingSubscriber) },
        NOW,
      ),
    ).toBe(true);
  });

  it("never ages a confirmed address out, however old", () => {
    expect(
      isSubscriberDue(
        {
          status: "confirmed",
          createdAt: new Date("2015-01-01T00:00:00.000Z"),
          unsubscribedAt: null,
          deletedAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("dates an unsubscribed address from unsubscribed_at, not created_at", () => {
    /* Created six years ago — far past every window — but unsubscribed
       yesterday. The 12-month clock starts at the unsubscribe. */
    expect(
      isSubscriberDue(
        {
          status: "unsubscribed",
          createdAt: new Date("2020-01-01T00:00:00.000Z"),
          unsubscribedAt: new Date("2026-08-14T04:00:00.000Z"),
          deletedAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("pins the unsubscribed boundary on both sides", () => {
    const base = {
      status: "unsubscribed" as const,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      deletedAt: null,
    };
    expect(
      isSubscriberDue(
        { ...base, unsubscribedAt: cutoffs.unsubscribedSubscriber },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSubscriberDue(
        {
          ...base,
          unsubscribedAt: justAfter(cutoffs.unsubscribedSubscriber),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("falls back to created_at when unsubscribed_at is null", () => {
    const base = {
      status: "unsubscribed" as const,
      unsubscribedAt: null,
      deletedAt: null,
    };
    expect(
      isSubscriberDue(
        { ...base, createdAt: cutoffs.unsubscribedSubscriber },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSubscriberDue(
        { ...base, createdAt: justAfter(cutoffs.unsubscribedSubscriber) },
        NOW,
      ),
    ).toBe(false);
  });

  it("does not apply the pending window to an unsubscribed address", () => {
    /* 40 days old, unsubscribed 40 days ago: past `pending`'s 30 days and
       nowhere near `unsubscribed`'s 12 months. */
    const fortyDaysAgo = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    expect(
      isSubscriberDue(
        {
          status: "unsubscribed",
          createdAt: fortyDaysAgo,
          unsubscribedAt: fortyDaysAgo,
          deletedAt: null,
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isSubscriberDue(
        {
          status: "pending",
          createdAt: fortyDaysAgo,
          unsubscribedAt: null,
          deletedAt: null,
        },
        NOW,
      ),
    ).toBe(true);
  });
});
