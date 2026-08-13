import { describe, expect, it } from "vitest";

import type { FactorInput } from "./emissions";
import {
  covers,
  factorSiblingKeys,
  preferCandidate,
  preferredBySourceRow,
  selectFactorForDate,
  type CandidateProvenance,
  type FactorCandidate,
} from "./factor-selection";

/**
 * Prompt 68. Written against the failure this module exists to prevent: a 2025
 * record costed at the 2026 factor, silently — a wrong number in a disclosure
 * rather than a missing one.
 */

const factor = (id: string): FactorInput => ({
  id,
  scope: "scope_1",
  scope3Category: null,
  scope2Method: null,
  gas: "co2e",
  ch4Variant: null,
  gwpSet: "AR5",
  value: "2.5",
  activityUnit: "kwh",
  resultUnit: "kg_co2e",
  biogenic: false,
});

const candidate = (
  id: string,
  over: Partial<FactorCandidate> = {},
): FactorCandidate => ({
  factor: factor(id),
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  setId: `set-${id}`,
  setOrganizationId: null,
  publicationYear: 2026,
  setCreatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

const year = (y: number, over: Partial<FactorCandidate> = {}) =>
  candidate(`f${y}`, {
    effectiveFrom: `${y}-01-01`,
    effectiveTo: `${y}-12-31`,
    publicationYear: y,
    setId: `set-${y}`,
    ...over,
  });

describe("covers", () => {
  it("includes both ends of the window", () => {
    const window = { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
    expect(covers(window, "2026-01-01")).toBe(true);
    expect(covers(window, "2026-12-31")).toBe(true);
  });

  it("excludes the day either side", () => {
    const window = { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
    expect(covers(window, "2025-12-31")).toBe(false);
    expect(covers(window, "2027-01-01")).toBe(false);
  });

  it("compares the strings rather than parsing a Date", () => {
    // A parsed date would drag a timezone into a column that has none, and
    // would move this boundary by a day in half the world.
    expect(covers({ effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
      "2026-12-31")).toBe(true);
  });
});

describe("selectFactorForDate", () => {
  it("uses the mapped row when its own set covers the date", () => {
    const mapped = year(2026);
    const chosen = selectFactorForDate(mapped, [year(2025)], "2026-06-01");
    expect(chosen?.id).toBe("f2026");
  });

  it("selects the earlier year's row for an earlier year's activity", () => {
    const mapped = year(2026);
    const chosen = selectFactorForDate(mapped, [year(2025)], "2025-06-01");
    expect(chosen?.id).toBe("f2025");
  });

  it("refuses rather than reaching for the nearest year", () => {
    // The whole point. 2024 activity against a 2025/2026 library produces no
    // figure, never an approximation.
    expect(
      selectFactorForDate(year(2026), [year(2025)], "2024-06-01"),
    ).toBeNull();
  });

  it("refuses when there are no siblings at all", () => {
    expect(selectFactorForDate(year(2026), [], "2025-06-01")).toBeNull();
  });

  it("keeps the mapped row even when a sibling also covers the date", () => {
    // A superseded or overlapping set must not quietly displace a deliberate
    // choice for the year that choice was made for.
    const chosen = selectFactorForDate(
      year(2026),
      [year(2026, { setId: "set-other", publicationYear: 2027 })],
      "2026-06-01",
    );
    expect(chosen?.id).toBe("f2026");
  });
});

describe("preferCandidate, the tie-break that decides a filed number", () => {
  const pick = (candidates: FactorCandidate[]) =>
    selectFactorForDate(
      year(2026),
      candidates,
      "2025-06-01",
    );

  it("prefers a tenant's own set to the published one", () => {
    const chosen = pick([
      year(2025, { setId: "published" }),
      year(2025, {
        setId: "tenant",
        setOrganizationId: "org-1",
        factor: factor("tenant-row"),
      }),
    ]);
    expect(chosen?.id).toBe("tenant-row");
  });

  it("prefers the later publication year among equals", () => {
    const chosen = pick([
      year(2025, { setId: "a", publicationYear: 2025, factor: factor("older") }),
      year(2025, { setId: "b", publicationYear: 2026, factor: factor("newer") }),
    ]);
    expect(chosen?.id).toBe("newer");
  });

  it("prefers the later created set when the publication year ties", () => {
    const chosen = pick([
      year(2025, {
        setId: "a",
        setCreatedAt: new Date("2026-01-01T00:00:00Z"),
        factor: factor("older"),
      }),
      year(2025, {
        setId: "b",
        setCreatedAt: new Date("2026-06-01T00:00:00Z"),
        factor: factor("newer"),
      }),
    ]);
    expect(chosen?.id).toBe("newer");
  });

  it("falls back to the set id, so nothing is left to arrival order", () => {
    const same = {
      setCreatedAt: new Date("2026-01-01T00:00:00Z"),
      publicationYear: 2025,
    };
    const a = year(2025, { ...same, setId: "aaa", factor: factor("a") });
    const b = year(2025, { ...same, setId: "bbb", factor: factor("b") });
    expect(pick([a, b])?.id).toBe("a");
    // The same two candidates in the other order must answer identically: a
    // figure that moves between runs over unchanged data is the failure.
    expect(pick([b, a])?.id).toBe("a");
  });

  it("is a total order over a shuffled list", () => {
    const candidates = [
      year(2025, { setId: "p1", publicationYear: 2025, factor: factor("p1") }),
      year(2025, { setId: "p2", publicationYear: 2026, factor: factor("p2") }),
      year(2025, {
        setId: "t1",
        setOrganizationId: "org-1",
        publicationYear: 2025,
        factor: factor("t1"),
      }),
    ];
    const orders = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
    ];
    for (const order of orders) {
      expect(pick(order.map((i) => candidates[i]))?.id).toBe("t1");
    }
  });

  it("sorts published after tenant-owned directly, not only through a pick", () => {
    const published = year(2025, { setId: "p" });
    const owned = year(2025, { setId: "t", setOrganizationId: "org-1" });
    expect(preferCandidate(owned, published)).toBeLessThan(0);
    expect(preferCandidate(published, owned)).toBeGreaterThan(0);
  });
});

/**
 * Prompt 70. `seedDefaultMappings` used to take the last row of an unordered
 * result, so which set's copy of a `source_row_id` a new organisation's default
 * named was undefined once two published sets were loaded. These cases are the
 * proof that the choice is fixed by the order and not by arrival.
 */
describe("preferredBySourceRow", () => {
  type Row = CandidateProvenance & { sourceRowId: string; id: string };

  const row = (over: Partial<Row> & { id: string }): Row => ({
    sourceRowId: "srcrow-1",
    setId: "set-2025",
    setOrganizationId: null,
    publicationYear: 2025,
    setCreatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });

  /** Every sequence of the input must answer identically. */
  const winnersOverEveryOrder = (rows: Row[]) => {
    const permute = (rest: Row[]): Row[][] =>
      rest.length <= 1
        ? [rest]
        : rest.flatMap((item, i) =>
            permute([...rest.slice(0, i), ...rest.slice(i + 1)]).map((tail) => [
              item,
              ...tail,
            ]),
          );
    return permute(rows).map((sequence) =>
      [...preferredBySourceRow(sequence)].map(
        ([sourceRowId, winner]) => `${sourceRowId}:${winner.id}`,
      ).sort(),
    );
  };

  it("takes the later publication year, whatever the input sequence", () => {
    for (const winners of winnersOverEveryOrder([
      row({ id: "older", setId: "set-2025", publicationYear: 2025 }),
      row({ id: "newer", setId: "set-2026", publicationYear: 2026 }),
    ])) {
      expect(winners).toEqual(["srcrow-1:newer"]);
    }
  });

  it("takes a tenant's own set ahead of a later published one", () => {
    for (const winners of winnersOverEveryOrder([
      row({ id: "published", setId: "set-2026", publicationYear: 2026 }),
      row({
        id: "supplied",
        setId: "set-own",
        setOrganizationId: "org-1",
        publicationYear: 2025,
      }),
    ])) {
      expect(winners).toEqual(["srcrow-1:supplied"]);
    }
  });

  it("falls through to createdAt when the publication year ties", () => {
    for (const winners of winnersOverEveryOrder([
      row({
        id: "earlier",
        setId: "set-a",
        setCreatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      row({
        id: "later",
        setId: "set-b",
        setCreatedAt: new Date("2026-06-01T00:00:00Z"),
      }),
    ])) {
      expect(winners).toEqual(["srcrow-1:later"]);
    }
  });

  it("falls through to the set id when createdAt ties too", () => {
    for (const winners of winnersOverEveryOrder([
      row({ id: "bbb", setId: "set-bbb" }),
      row({ id: "aaa", setId: "set-aaa" }),
    ])) {
      expect(winners).toEqual(["srcrow-1:aaa"]);
    }
  });

  it("decides each source row independently", () => {
    for (const winners of winnersOverEveryOrder([
      row({ id: "a-2025", sourceRowId: "srcrow-a", setId: "s25", publicationYear: 2025 }),
      row({ id: "a-2026", sourceRowId: "srcrow-a", setId: "s26", publicationYear: 2026 }),
      row({ id: "b-2025", sourceRowId: "srcrow-b", setId: "s25", publicationYear: 2025 }),
    ])) {
      expect(winners).toEqual(["srcrow-a:a-2026", "srcrow-b:b-2025"]);
    }
  });

  it("omits a source row no candidate carries, so the seeder inserts nothing for it", () => {
    const winners = preferredBySourceRow([row({ id: "only" })]);
    expect(winners.get("srcrow-1")?.id).toBe("only");
    expect(winners.has("absent-row")).toBe(false);
    expect(winners.size).toBe(1);
  });

  it("returns an empty map for no candidates at all", () => {
    expect(preferredBySourceRow([]).size).toBe(0);
  });
});

/**
 * Prompt 71. Written against the failure this rule exists to close: a customer
 * supplies a set covering 2024, the published data does not cover 2024, and the
 * record resolves `out_of_period` because the tenant row is not reachable under
 * the mapping's published key.
 */
describe("factorSiblingKeys", () => {
  it("returns the row's own pair when nothing is superseded", () => {
    expect(
      factorSiblingKeys({ source: "DESNZ", sourceRowId: "1_100_1000_15_1" }),
    ).toEqual([{ source: "DESNZ", sourceRowId: "1_100_1000_15_1" }]);
  });

  it("returns both pairs when a supersession is declared", () => {
    expect(
      factorSiblingKeys({
        source: "Supplier tariff",
        sourceRowId: "custom:abc123",
        supersedesSource: "DESNZ",
        supersedesSourceRowId: "1_100_1000_15_1",
      }),
    ).toEqual([
      { source: "Supplier tariff", sourceRowId: "custom:abc123" },
      { source: "DESNZ", sourceRowId: "1_100_1000_15_1" },
    ]);
  });

  it("keeps the row reachable under its own pair as well as the superseded one", () => {
    const keys = factorSiblingKeys({
      source: "Supplier tariff",
      sourceRowId: "custom:abc123",
      supersedesSource: "DESNZ",
      supersedesSourceRowId: "1_100_1000_15_1",
    });
    /* A mapping pointing directly at the tenant row must still find it — the
       supersession adds a key, it never replaces one. */
    expect(keys).toContainEqual({
      source: "Supplier tariff",
      sourceRowId: "custom:abc123",
    });
    expect(keys).toHaveLength(2);
  });

  it("ignores a half-declared pair rather than inventing the missing half", () => {
    const own = [{ source: "Supplier tariff", sourceRowId: "custom:abc123" }];
    expect(
      factorSiblingKeys({
        source: "Supplier tariff",
        sourceRowId: "custom:abc123",
        supersedesSource: "DESNZ",
      }),
    ).toEqual(own);
    expect(
      factorSiblingKeys({
        source: "Supplier tariff",
        sourceRowId: "custom:abc123",
        supersedesSourceRowId: "1_100_1000_15_1",
      }),
    ).toEqual(own);
    expect(
      factorSiblingKeys({
        source: "Supplier tariff",
        sourceRowId: "custom:abc123",
        supersedesSource: null,
        supersedesSourceRowId: null,
      }),
    ).toEqual(own);
  });

  it("collapses a pair identical to the row's own, so it cannot compete with itself", () => {
    expect(
      factorSiblingKeys({
        source: "DESNZ",
        sourceRowId: "1_100_1000_15_1",
        supersedesSource: "DESNZ",
        supersedesSourceRowId: "1_100_1000_15_1",
      }),
    ).toEqual([{ source: "DESNZ", sourceRowId: "1_100_1000_15_1" }]);
  });

  it("does not collapse a same-row-id pair from a different publisher", () => {
    /* Two publishers reusing one row-id string is exactly why `source` stays in
       the key: dropping it would merge their sibling sets and produce a wrong
       figure rather than a missing one. */
    expect(
      factorSiblingKeys({
        source: "Supplier tariff",
        sourceRowId: "1_100_1000_15_1",
        supersedesSource: "DESNZ",
        supersedesSourceRowId: "1_100_1000_15_1",
      }),
    ).toHaveLength(2);
  });
});
