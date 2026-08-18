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

/**
 * The issue shape this module reads, and the only part of a `ZodError` it
 * touches.
 *
 * **Structural rather than `import type { ZodError } from "zod"`, and that is a
 * decision rather than a limitation.** The type-only import provably costs
 * nothing at runtime — `isolatedModules` is on and TypeScript elides an
 * `import type` unconditionally — so erasure was never the argument. Two things
 * decided it: this module's stated property is that it *imports nothing*, which
 * is what lets three leaves inside prerendered marketing routes (AGENTS.md 8.1)
 * import it without reasoning about what comes with it; and the narrow shape is
 * the enforcement of AGENTS.md 8.3 rule 2 in the type system. A Zod issue can
 * carry an `input` value on some codes — a submitted email address, a CV
 * filename — and a parameter that cannot see `input` cannot leak it.
 */
type FieldIssues = {
  readonly issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[];
};

/**
 * Maps a validation failure onto the fields a form renders — **once, for both
 * sides of the seam**.
 *
 * Prompt 121 collapsed 23 hand-rolled copies of this into this function, across
 * 17 modules: six distinct shapes over ten client leaves, ten `z.flattenError`
 * call sites hand-keying their fields one by one, and four named local adapters
 * — two of which implemented character-for-character the same rule for the same
 * field type on opposite sides of the seam (`fieldErrorsFromIssues` in
 * `app/_components/activity/custom-factor-form.tsx` and
 * `customFactorFieldErrors` in `app/activity/actions.ts`). `z.flattenError` has
 * no caller left in the repository.
 *
 * The three rules, which every one of those copies already agreed on:
 *
 * 1. **A field is its issue path joined with `"."`** — a top-level issue keys
 *    `"name"`, a nested one keys `"factor.value"`.
 * 2. **The longest declared prefix wins**, so an issue landing deeper than the
 *    field that owns it — `["factor", "supersedes", "source"]` against a
 *    declared `factor.supersedes` — still reaches that field.
 * 3. **The first issue to claim a field wins.** Later issues on the same field
 *    are dropped, because a control shows one message.
 *
 * An issue with an empty path belongs to no field and is dropped; it is the
 * caller's `error` sentence that carries it, exactly as `z.flattenError`'s
 * `formErrors` did.
 *
 * @param fields the fields the caller renders — either the list itself, or any
 * record keyed by them, so a form holding a `NO_FIELD_ERRORS` constant can pass
 * that rather than restating its field names. **Declaring them is what makes
 * rule 2 possible** and what keeps a schema-only field, which no control
 * renders, from producing an error nothing can show.
 */
export function fieldErrorsFrom<TField extends string>(
  error: FieldIssues,
  fields: readonly TField[] | Readonly<Record<TField, unknown>>,
): Partial<Record<TField, string>> {
  const declared: readonly TField[] = Array.isArray(fields)
    ? (fields as readonly TField[])
    : (Object.keys(fields) as TField[]);

  const fieldErrors: Partial<Record<TField, string>> = {};
  for (const issue of error.issues) {
    const segments = issue.path.map(String);
    for (let depth = segments.length; depth > 0; depth -= 1) {
      const field = segments.slice(0, depth).join(".") as TField;
      if (!declared.includes(field)) continue;
      fieldErrors[field] ??= issue.message;
      break;
    }
  }
  return fieldErrors;
}
