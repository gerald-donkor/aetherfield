import { defineConfig } from "vitest/config";

/**
 * Unit tests, scoped to the two pure `lib/` layers — added by build step 10,
 * widened to `lib/validation/` by prompt 121.
 *
 * **`lib/domain/` and `lib/validation/`, and that scope is the point.** AGENTS.md 6.2 requires
 * the domain layer to be "pure functions over typed inputs, no database handle,
 * no `fetch`, no implicit `Date.now()`" and therefore independently testable,
 * and step 10 put an exact-decimal arithmetic engine there whose output lands
 * in regulatory disclosures. A `include` that reached wider would invite tests
 * that need a database or a browser, which is what `npm run test:e2e`
 * (Playwright, Chromium / Firefox natively plus WebKit in the pinned rootless
 * Podman container) already covers.
 *
 * **`lib/validation/` is the one addition that argument permits, not an
 * exception to it.** It is the one module under `lib/` that AGENTS.md 6.3
 * *forbids* to be `server-only`, to read a secret or to import `lib/db/` — its
 * schemas are imported by client leaves and by actions alike. `fieldErrorsFrom`
 * in `./result.ts` is a pure function over typed inputs with no I/O, it decides
 * which message a person sees against which control on every write path in the
 * app, and it has no other test: `npm run test:e2e` exercises three of the
 * eleven forms that call it.
 *
 * No environment, no setup file, no mocks: every test here calls a function
 * with arguments and asserts on its return value. If a test in either directory
 * ever needs a mock, the thing it is testing has stopped being pure and belongs
 * somewhere else.
 */
export default defineConfig({
  test: {
    include: ["lib/{domain,validation}/**/*.test.ts"],
    environment: "node",
  },
});
