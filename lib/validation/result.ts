/**
 * The typed result every public write path in phase one returns (AGENTS.md 10
 * rule 2). **One vocabulary, not one per flow** — step 2 declared this next to
 * the demo-request schema and predicted that "steps 4 and 5 import this shape
 * rather than inventing their own"; step 4 is the first to need it, so it moves
 * here rather than being copied. `lib/validation/lead.ts` re-exports the
 * specialisation it already published, so nothing importing `SubmitResult` from
 * there had to change.
 *
 * **Not server-only**, for the same reason the schemas beside it are not: a
 * client leaf renders this value, so the type has to survive into the browser's
 * type graph. It reads no secret and imports nothing.
 *
 * It is declared here rather than in the action because an action is a
 * `"use server"` module, and every runtime export of one of those must be an
 * async function.
 *
 * @typeParam TField the form's field names, so `fieldErrors` can only be keyed
 * by a field that exists. A path with no per-field errors — the token actions
 * in step 4 — leaves it off and gets `never`.
 */
export type SubmitResult<TField extends string = never> =
  | { ok: true }
  | {
      ok: false;
      /** Always safe to render. Never an exception string. */
      error: string;
      fieldErrors?: Partial<Record<TField, string>>;
    };
