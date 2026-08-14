import { describe, expect, it } from "vitest";

import {
  factorMatchBand,
  factorMatchSourceText,
  rankFactorMatches,
} from "./factor-match";

it("assembles the publisher label without inventing missing levels", () => {
  expect(factorMatchSourceText(["Fuel", null, "Diesel"])).toBe(
    "Fuel · Diesel",
  );
});

describe("factorMatchBand", () => {
  it("labels the judged close-wording boundary explicitly", () => {
    expect(factorMatchBand(0.1)).toBe("close");
    expect(factorMatchBand(0.099)).toBe("weak");
  });
});

describe("rankFactorMatches", () => {
  const candidates = [
    { id: "b", similarity: 0.7 },
    { id: "a", similarity: 0.8 },
    { id: "c", similarity: 0.02 },
  ];

  it("orders by trigram similarity and labels every row", () => {
    const ranked = rankFactorMatches(candidates);
    expect(ranked.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(ranked.map((row) => row.band)).toEqual(["close", "close", "weak"]);
  });

  it("clamps database scores without changing the input", () => {
    const input = [{ id: "x", similarity: 1.2 }];
    expect(rankFactorMatches(input)[0]?.score).toBe(1);
    expect(input[0]?.similarity).toBe(1.2);
  });

  it("has a stable id tail when every score ties", () => {
    expect(
      rankFactorMatches([
        { id: "z", similarity: 0.5 },
        { id: "a", similarity: 0.5 },
      ]).map((row) => row.id),
    ).toEqual(["a", "z"]);
  });
});
