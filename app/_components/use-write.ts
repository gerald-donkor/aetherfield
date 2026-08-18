"use client";

import { useCallback, useState } from "react";

import { NETWORK_ERROR, fieldErrorsFrom } from "../../lib/validation/result";

/**
 * The six-stage submit lifecycle every write-path client leaf hand-rolled,
 * collapsed into one hook — AGENTS.md §5.4 candidate 2, `docs/architecture.md`.
 *
 * Prompt 121 collapsed the *mapping* half of this (`fieldErrorsFrom`) into one
 * place; this collapses the *lifecycle* half — clear, parse, pend, call,
 * handle, settle — that 26 submit paths across 21 files each reimplemented by
 * hand, with the `finally` shape alone diverging four ways.
 *
 * **This does not match the review's literal `useWrite(schema, action, FIELDS)`
 * sketch.** Three things measured this session ruled it out: the call
 * signature is not uniform across the 26 sites (one argument, two arguments, a
 * `FormData`, none at all), not every path parses with a schema (two hand-check
 * required fields instead), and some success handlers read an extra field off
 * the result (`stageImport`'s `importId`). So this hook owns the *invocation*
 * — `call` is a thunk a site can close over however many arguments its own
 * action needs — and `parse` is optional.
 *
 * **`onSuccess`'s return value is the module's one addition beyond the
 * review's sketch**, needed because `upload-form.tsx` deliberately holds
 * `pending` across a `router.push` ("re-enabling the button first invites a
 * second upload of the same file") and no other shape in this file can express
 * that without exporting pending's setter, which nothing else needs. Returning
 * a plain string is the common case; `{ message, hold: true }` is the one site
 * that isn't.
 *
 * **`submit` resolves to whether the write succeeded**, not `void`. Several
 * sites collapse an inline confirm state only when the write failed
 * (`action-controls.tsx`'s `RemoveSubmissionControl`, `members-panel.tsx`'s
 * `RemoveMemberControl` and `LeaveControl`, `retire-target-control.tsx`) — a
 * result the review's sketch never named a way to observe. A boolean is the
 * whole surface such a site needs; it is not a second export.
 *
 * **Nothing here logs** — `form-status.tsx`'s docblock ends the same way, for
 * the same reason (AGENTS.md 8.3 rule 2). This module handles submitted form
 * values only in memory in the browser.
 */

/** The issue shape this module reads — the same structural type
 * `lib/validation/result.ts` declares for `fieldErrorsFrom`, restated rather
 * than imported because that type is not exported. Structural, not
 * `import type { ZodError }`, for the reason that module's docblock gives: a
 * parameter that cannot see an issue's `input` cannot leak a submitted email
 * address or CV filename. Verified this session that `.safeParse()` returns a
 * discriminated union carrying exactly this shape on `error` (`zod-docs`
 * skill). */
type Issues = {
  readonly issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[];
};

/** What a schema's `.safeParse()` returns, typed structurally rather than
 * imported from `zod` — the same argument. */
type ParseOutcome<TData> =
  | { success: true; data: TData }
  | { success: false; error: Issues };

/** The result shape every write path returns (`SubmitResult`, widened to allow
 * the extra fields some actions attach — `stageImport`'s `importId`,
 * `retireFactorSet`'s `mappingCount`). */
type WriteResult<TField extends string> =
  | ({ ok: true } & Record<string, unknown>)
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<TField, string>>;
    };

/** What `onSuccess` may return to shape the settle stage. A plain string is
 * the common case — the announced success sentence. `{ message, hold: true }`
 * is `upload-form.tsx`'s one case: the message is announced but `pending`
 * stays true, because a navigation is about to replace the form. `void` is
 * `token-action.tsx`'s case: success there drives a separate `state` value
 * the leaf renders itself, not an announced sentence. */
type SuccessOutcome = string | { message: string; hold: true } | void;

export function useWrite<TField extends string = never>(
  options: {
    /** The fields a caller's schema issues can key. Passed straight through to
     * `fieldErrorsFrom` — either form it accepts. Omit when the path carries no
     * per-field schema (most of the plain confirm/action controls). */
    fields?: readonly TField[] | Readonly<Record<TField, unknown>>;
    /** The sentence shown when `parse` fails — the site's own
     * singular/plural wording, never normalised (AGENTS.md, this prompt's
     * equivalence rule). Only read when `submit` is given a `parse`. */
    fieldsMessage?: string;
  } = {},
) {
  const { fields, fieldsMessage } = options;

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Partial<Record<TField, string>>>({});

  const reset = useCallback(() => {
    setPending(false);
    setMessage("");
    setErrors({});
  }, []);

  /** The non-Zod courtesy check — `upload-form.tsx` hand-checks file presence
   * and size, `mapping-form.tsx` hand-checks required columns. Both produce
   * field errors and a fields sentence without a `ZodError` ever existing, so
   * `submit`'s own `parse` stage does not fit them; this is the same two
   * stages (map issues, then the message) called directly. */
  const invalid = useCallback(
    (fieldErrors: Partial<Record<TField, string>>, invalidMessage: string) => {
      setErrors(fieldErrors);
      setMessage(invalidMessage);
    },
    [],
  );

  /* Not memoised: it closes over `fields` and `fieldsMessage` directly, and
     those are read fresh on every call rather than shadowed through a ref —
     mutating a ref during render is itself a rules-of-hooks violation. Every
     call site reads `submit` off the hook's own return value in the same
     render it calls it, so an unmemoised function costs nothing here. */
  async function submit<
    TData = undefined,
    TResult extends WriteResult<TField> = WriteResult<TField>,
  >({
    parse,
    call,
    onSuccess,
    onSettled,
  }: {
      /** Optional: runs the shared schema and maps its issues onto `fields`
       * with the module's `fieldsMessage`, as `createReportSchema.safeParse`
       * etc. already did by hand at every site that has one. Omit at a site
       * with no schema-shaped courtesy check — call `invalid()` before
       * `submit()` instead. */
      parse?: () => ParseOutcome<TData>;
      /** The invocation itself, as a thunk. Takes the parsed data when `parse`
       * was given; a site with no `parse` closes over whatever its own action
       * needs (`updateImportMapping(importId, draft)`, `leaveOrganization()`). */
      call: (data: TData) => Promise<TResult>;
      /** Runs only when `call` resolves `{ ok: true }`. Returns the sentence to
       * announce, or `{ message, hold: true }` to announce it without clearing
       * `pending` (`upload-form.tsx`'s navigation). */
      onSuccess?: (result: Extract<TResult, { ok: true }>) => SuccessOutcome;
      /** Runs whenever `call` resolves at all — `{ ok: true }` or
       * `{ ok: false }` alike — but not on a network-error catch.
       * `report-controls.tsx`'s `ReportAction` is the one measured site: it
       * calls `router.refresh()` on both a successful and a refused draft,
       * because either changes the report's narrative status, but not on a
       * failed round trip, which changed nothing server-side to refresh from. */
    onSettled?: () => void;
  }): Promise<boolean> {
    setMessage("");
    setErrors({});

    let data: TData = undefined as TData;
    if (parse) {
      const parsed = parse();
      if (!parsed.success) {
        setErrors(fieldErrorsFrom(parsed.error, fields ?? ([] as const)));
        setMessage(fieldsMessage ?? "");
        return false;
      }
      data = parsed.data;
    }

    setPending(true);
    let holding = false;
    try {
      const result = await call(data);
      onSettled?.();
      if (result.ok) {
        const outcome = onSuccess?.(result as Extract<TResult, { ok: true }>);
        if (outcome && typeof outcome === "object") {
          holding = true;
          setMessage(outcome.message);
        } else if (typeof outcome === "string") {
          setMessage(outcome);
        }
        return true;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
      return false;
    } catch {
      setMessage(NETWORK_ERROR);
      return false;
    } finally {
      if (!holding) setPending(false);
    }
  }

  /* `setMessage` and `setErrors` are exported, and that is a finding rather
     than a default. Two shapes recur across the measured sites that neither
     `submit` nor `invalid` covers:

     - **Arming and cancelling a confirm step clears or sets `message` outside
       any submit** — `action-controls.tsx`'s `RemoveSubmissionControl`,
       `retire-target-control.tsx`, `members-panel.tsx`'s `RemoveMemberControl`
       and `LeaveControl`, and `retire-set-button.tsx` / `retire-factor-button.tsx`
       all clear the previous result on arm and several announce
       "Retirement cancelled." on cancel.
     - **Clearing one field's error on change, functionally** —
       `create-target-form.tsx`'s "Use calculated figure" shortcut and
       `factor-import-form.tsx`'s file input both clear a single key with
       `setErrors((current) => ({ ...current, field: undefined }))`, which
       `invalid`'s whole-object replacement cannot express. */
  return { pending, message, errors, submit, invalid, reset, setMessage, setErrors };
}
