import { defineConfig } from "vitest/config";

/**
 * Unit tests, scoped to the pure domain layer — added by build step 10.
 *
 * **`lib/domain/` only, and that scope is the point.** AGENTS.md 6.2 requires
 * the domain layer to be "pure functions over typed inputs, no database handle,
 * no `fetch`, no implicit `Date.now()`" and therefore independently testable,
 * and step 10 put an exact-decimal arithmetic engine there whose output lands
 * in regulatory disclosures. A `include` that reached wider would invite tests
 * that need a database or a browser, which is what `npm run test:e2e`
 * (Playwright, Chromium / Firefox natively plus WebKit in the pinned rootless
 * Podman container) already covers.
 *
 * No environment, no setup file, no mocks: every test here calls a function
 * with arguments and asserts on its return value. If a test in this directory
 * ever needs a mock, the thing it is testing has stopped being pure and belongs
 * somewhere else.
 */
export default defineConfig({
  test: {
    include: ["lib/domain/**/*.test.ts"],
    environment: "node",
  },
});
