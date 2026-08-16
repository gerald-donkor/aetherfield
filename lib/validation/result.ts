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

/**
 * What a leaf shows when the Server Action call itself never completes — the
 * `catch` around the invocation, not a typed `{ ok: false }` the action
 * returned.
 *
 * **Declared in sixteen files, and in two different sentences, until prompt
 * 106.** Twelve constants and seven inlined literals said "Check your
 * connection and try again"; four constants and two more inlined literals said
 * only "Please try again". The copy a person saw for one identical failure
 * depended on which control they had pressed.
 *
 * **The longer sentence won, and the choice is a judgement** — there is no
 * measurement of comprehension to appeal to (§12 rule 4). Two reasons: it is
 * already the large majority, so fewer surfaces change; and it is the only one
 * of the two that is *operational*, which is the register AGENTS.md §5 sets. A
 * failure the user can act on should say what to check. **No site carried a
 * comment or docblock justifying the shorter text**, which is the evidence that
 * the divergence was accidental rather than deliberate.
 *
 * It lives here because this module already owns the vocabulary every write
 * path speaks, it is deliberately **not** `server-only` (§6.3), and it imports
 * nothing — so a marketing route's client leaf can import it without pulling
 * anything into a prerendered page's bundle.
 */
export const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";
