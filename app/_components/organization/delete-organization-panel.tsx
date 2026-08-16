"use client";

import { type FormEvent, useState } from "react";

import {
  requestOrganizationDeletion,
  restoreOrganization,
} from "../../account/actions";
import {
  type DeleteOrganizationFieldErrors,
  deleteOrganizationSchema,
  NO_DELETE_ORGANIZATION_FIELD_ERRORS,
  ORGANIZATION_DELETION_ERRORS,
  ORGANIZATION_DELETION_WINDOW_DAYS,
} from "../../../lib/validation/organization";
import { Button, Field } from "../primitives";
import { FormStatus } from "../form-status";

/**
 * The organisation's deletion surface — prompt 73.
 *
 * **Component-only**, like every other client leaf: no constant and no type is
 * exported from this module (AGENTS.md front matter, bundle rule). Built from
 * `Field` and `Button` and nothing else — 7.5 forbids a second design system.
 *
 * **No GSAP** (AGENTS.md 7.5; the demo dialog's close button remains the one
 * granted exception and this is not it). **No redirect on success** (10
 * rule 5) — both actions revalidate `/account` and the section re-renders into
 * its other state in place.
 *
 * **Two states, and the page decides which by passing `purgeLabel`.** Unlocked
 * is the request form; locked is the notice and the restore control. A member
 * who is not an owner sees the locked notice with no restore control and no
 * delete form at all — **presentation only.** Both actions re-read the caller's
 * role from Postgres and refuse a non-owner regardless (11.2 rule 2).
 *
 * **The confirmation is the organisation's own identifier, typed out.** The
 * client parse is a courtesy (6.2, 10 rule 1); the action re-runs the same
 * schema *and* compares the value against the slug on the membership row it
 * resolved server-side, which is the check.
 */

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

function RestoreControl({ organizationName }: { organizationName: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function restore() {
    setPending(true);
    setMessage("");
    try {
      const result = await restoreOrganization();
      setMessage(
        result.ok
          ? `${organizationName} is restored. Its data is available again and nothing was removed.`
          : result.error,
      );
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button className="mt-8" onClick={restore} disabled={pending}>
        {pending ? "Restoring..." : "Restore organisation"}
      </Button>
      <FormStatus message={message} className="mt-4 max-w-[560px]" />
    </>
  );
}

function DeleteForm({
  organizationName,
  organizationSlug,
}: {
  organizationName: string;
  organizationSlug: string;
}) {
  const [confirmSlug, setConfirmSlug] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<DeleteOrganizationFieldErrors>(
    NO_DELETE_ORGANIZATION_FIELD_ERRORS,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsed = deleteOrganizationSchema.safeParse({ confirmSlug });
    if (!parsed.success) {
      setErrors({
        confirmSlug:
          parsed.error.issues[0]?.message ?? "Type the identifier to confirm.",
      });
      setMessage("Check the marked field and try again.");
      return;
    }
    /* The same comparison the action makes, run here only so a typo costs no
       round trip. The action's copy is the one that decides. */
    if (parsed.data.confirmSlug !== organizationSlug) {
      setErrors({ confirmSlug: ORGANIZATION_DELETION_ERRORS.SLUG_MISMATCH });
      setMessage("Check the marked field and try again.");
      return;
    }

    setErrors(NO_DELETE_ORGANIZATION_FIELD_ERRORS);
    setPending(true);
    try {
      const result = await requestOrganizationDeletion(parsed.data);
      if (result.ok) {
        /* The page revalidates into its locked state, so this sentence is what
           the person reads in the moment between the two. */
        setMessage(
          `${organizationName} is scheduled for deletion and is now locked.`,
        );
        setConfirmSlug("");
        return;
      }
      setErrors({
        ...NO_DELETE_ORGANIZATION_FIELD_ERRORS,
        ...result.fieldErrors,
      });
      setMessage(result.error);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-7">
      <p className="max-w-[680px] font-serif text-p2 text-muted">
        Deleting {organizationName} locks it immediately and erases it after{" "}
        {ORGANIZATION_DELETION_WINDOW_DAYS} days. Everything recorded against it
        goes: its members and invitations, its sites, its imported files, its
        activity records and calculated emissions, its targets, its reports and
        any emission factors it supplied itself. An owner can restore it at any
        point before that date; after it, nothing can.
      </p>

      <FormStatus
        message={message}
        as="div"
        role="alert"
        className="mt-6 max-w-[560px]"
      />

      <Field
        id="delete-organization-slug"
        name="confirmSlug"
        type="text"
        label="Confirm the identifier"
        hint={`Type ${organizationSlug} to confirm.`}
        autoComplete="off"
        spellCheck={false}
        value={confirmSlug}
        onChange={(event) => setConfirmSlug(event.target.value)}
        error={errors.confirmSlug || undefined}
        disabled={pending}
        maxLength={48}
        required
        className="mt-6 max-w-[560px]"
      />

      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Scheduling deletion..." : "Delete organisation"}
      </Button>
    </form>
  );
}

export function DeleteOrganizationPanel({
  organizationName,
  organizationSlug,
  viewerIsOwner,
  purgeLabel,
  className = "",
}: {
  organizationName: string;
  organizationSlug: string;
  viewerIsOwner: boolean;
  /** The formatted purge date when the organisation is locked, `null` when it
      is not. Formatted on the server: a leaf that formats a date hydrates
      differently depending on where it runs. */
  purgeLabel: string | null;
  className?: string;
}) {
  if (purgeLabel) {
    return (
      <div className={className}>
        <p className="max-w-[680px] font-serif text-p2 text-muted">
          {organizationName} is scheduled for deletion. Its data is locked —
          neither readable nor changeable — and everything recorded against it
          is permanently erased on {purgeLabel}.
        </p>
        {viewerIsOwner ? (
          <>
            <p className="mt-4 max-w-[680px] font-serif text-p2 text-muted">
              Restoring unlocks the workspace immediately. Nothing has been
              removed yet.
            </p>
            <RestoreControl organizationName={organizationName} />
          </>
        ) : (
          <p className="mt-4 max-w-[680px] font-serif text-p2 text-muted">
            An owner of {organizationName} can reverse this before that date.
          </p>
        )}
      </div>
    );
  }

  /* Not locked, and not an owner: no control and no copy about one. Hiding it
     is presentation; the action refuses a non-owner regardless. */
  if (!viewerIsOwner) return null;

  return (
    <div className={className}>
      <DeleteForm
        organizationName={organizationName}
        organizationSlug={organizationSlug}
      />
    </div>
  );
}
