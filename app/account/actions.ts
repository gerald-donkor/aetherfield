"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuth, getCurrentAccount } from "../../lib/auth/server";
import { resolveTenant } from "../../lib/auth/tenant";
import { setAlertPreference } from "../../lib/db/alert-queries";
import {
  cancelDeletionRequest,
  createDeletionRequest,
  getPendingDeletion,
  listMembersForOrganization,
  listOwnerEmails,
  listPendingInvitations,
} from "../../lib/db/organization-queries";
import { sendOrganizationDeletionNotice } from "../../lib/email/organization";
import { checkLimit, formatRetry } from "../../lib/rate-limit";
import {
  ALERT_PREFERENCE_ERRORS,
  alertPreferenceSchema,
  type AlertPreferenceResult,
} from "../../lib/validation/alerts";
import {
  cancelInvitationSchema,
  type CreateOrganizationField,
  createOrganizationSchema,
  type DeleteOrganizationField,
  deleteOrganizationSchema,
  type InviteMemberField,
  inviteMemberSchema,
  MEMBERSHIP_ERRORS,
  NO_DELETE_ORGANIZATION_FIELD_ERRORS,
  NO_INVITE_FIELD_ERRORS,
  NO_ORGANIZATION_FIELD_ERRORS,
  ORGANIZATION_DELETION_ERRORS,
  ORGANIZATION_DELETION_WINDOW_DAYS,
  removeMemberSchema,
} from "../../lib/validation/organization";
import {
  fieldErrorsFrom,
  type SubmitResult,
} from "../../lib/validation/result";

/**
 * Create an organisation — build step 8, and the first mutation on this site
 * whose stage **d** does real work (AGENTS.md 10 rule 6).
 *
 * **The shape is step 2's, not an invention.** The stages below carry 10's own
 * letters in 10's own order, exactly as `app/_actions/demo-request.ts` and
 * `app/_actions/newsletter.ts` do. Three things differ, and each is named where
 * it happens: there is no BotID check, the rate limit is keyed by the user id
 * rather than the IP, and the session is resolved *before* the limit because
 * the limit needs the id.
 *
 * **Nothing personal is ever logged** (AGENTS.md 8.3 rule 2). Neither is the
 * organisation name or slug, which are a customer's commercial data — the catch
 * blocks below log nothing at all, and the payload never reaches a console.
 */

const GENERIC_FAILURE =
  "We couldn't create that organisation just now. Please try again in a moment.";

const SIGNED_OUT =
  "Your session has expired. Sign in again to create an organisation.";

const NOT_PERMITTED =
  "This account can't create an organisation. Verify your email address first.";

const AT_LIMIT =
  "This account has reached its limit of organisations. Contact us to raise it.";

const SLUG_TAKEN = "That identifier is already in use. Choose another.";

export async function createOrganization(
  input: unknown,
): Promise<SubmitResult<CreateOrganizationField>> {
  // -- a. BotID -----------------------------------------------------------
  /* **Deliberately absent, and this is the decision rather than an omission.**
     AGENTS.md 8.2 governs *public* write paths — the three phase-one forms are
     unauthenticated POSTs any visitor can reach, which is what BotID answers.
     This path requires a live session on a verified account, so the session
     check at stage b is a strictly stronger gate than a bot heuristic. Adding
     it would also mean adding `/account` to `instrumentation-client.ts`, and
     AGENTS.md 7.3 records that a path in that list is a two-file commitment
     whose absence makes the server call *fail* rather than pass. Recorded in
     `docs/backend.md`, step 8, so it is not re-derived later. */

  // -- b. Session, then the rate limit ------------------------------------
  /* Session first, because the limit is keyed by the user id and there is no
     key without it. A signed-out caller is rejected **here** — `proxy.ts`'s
     redirect is optimistic and is not enforcement (AGENTS.md 7.3, 11.2 rule 1),
     and an action must never redirect a caller that is waiting on a typed
     result (10 rule 2). */
  let account: Awaited<ReturnType<typeof getCurrentAccount>>;
  try {
    account = await getCurrentAccount();
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
  if (!account) return { ok: false, error: SIGNED_OUT };

  /* **`account.role` is read but never consulted.** Aetherfield's `staff` and
     `admin` are orthogonal to tenant membership (AGENTS.md 11), and being staff
     grants nothing on this path — the same invariant `lib/auth/organization.ts`
     states for reads. */
  try {
    const limit = await checkLimit("organization-create", account.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many attempts. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed, as every earlier path does: an unlimited write path is
    // worse than a form that is briefly unavailable, and 8.2 rule 4 requires
    // the failure be visible rather than a silent success.
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- c. Parse, with the same schema the leaf ran -------------------------
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the marked fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error, NO_ORGANIZATION_FIELD_ERRORS),
    };
  }
  const { name, slug } = parsed.data;

  // -- d. Authorise and write ---------------------------------------------
  /* The plugin owns both. `allowUserToCreateOrganization` re-checks
     `emailVerified` and `organizationLimit` counts existing rows, both inside
     the endpoint — verified by reading
     `node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs`,
     not recalled (AGENTS.md 12 rule 2). The headers are forwarded so the
     endpoint resolves the same session this action just authorised;
     `headers()` is async on Next 16 (7.3). */
  try {
    await getAuth().api.createOrganization({
      body: { name, slug },
      headers: await headers(),
    });
  } catch (error) {
    /* The endpoint signals failure by throwing a Better Auth `APIError` whose
       `body.code` is one of `ORGANIZATION_ERROR_CODES`. Those are translated
       into this path's typed vocabulary here so nothing throws to the client
       (10 rule 2) and no exception string is ever rendered. */
    if (isAPIError(error)) {
      switch (error.body?.code) {
        case "ORGANIZATION_ALREADY_EXISTS":
          /* A duplicate slug is a **field** error, not a generic failure: it
             names the one input the person can fix. */
          return {
            ok: false,
            error: "Check the marked field and try again.",
            fieldErrors: { slug: SLUG_TAKEN },
          };
        case "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION":
          return { ok: false, error: NOT_PERMITTED };
        case "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS":
          return { ok: false, error: AT_LIMIT };
      }
    }
    /* Anything else is unexpected, and it leaves as a safe generic message with
       nothing logged — the payload, the name and the slug all stay out of the
       console (8.3 rule 2). */
    return { ok: false, error: GENERIC_FAILURE };
  }

  /* -- e. Revalidate ------------------------------------------------------
     `/account` renders the account's organisation and role, and the row it
     reads has just changed. **No redirect** (10 rule 5) — the page swaps to its
     new state in place, and the leaf renders this result. */
  revalidatePath("/account");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Members and invitations — prompt 63, closing what step 8 deferred          */
/* -------------------------------------------------------------------------- */

/**
 * Stage **b** for all four membership actions below, in one place.
 *
 * **The body moved to `lib/auth/tenant.ts` at prompt 98**, behaviour-identical,
 * when the same preamble was found in six more actions in
 * `app/activity/actions.ts`. What is left here is the part that was ever
 * local: the limiter this flow spends, and the sentences it owes its own user.
 *
 * The shared helper resolves the session and the tenant, enforces the deletion
 * lock, then spends the limit — in that order, because the limit is keyed by
 * the user id and there is no key without the session (the reason
 * `createOrganization` gives above). It **fails closed** on a limiter error, as
 * every authenticated path here does.
 *
 * The lock is why these four cannot share `restoreOrganization`'s helper: a
 * locked organisation may do exactly one thing, and it is `restoreOrganization`
 * below; membership is not it. See `resolveOwnerForDeletion`.
 *
 * Not exported. A `"use server"` module's runtime exports must all be async
 * functions, and this is a helper rather than an entry point.
 */
async function resolveMembershipForWrite() {
  return resolveTenant({
    messages: {
      signedOut: MEMBERSHIP_ERRORS.SIGNED_OUT,
      noOrganization: MEMBERSHIP_ERRORS.NO_ORGANIZATION,
      organizationLocked: MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED,
      failure: MEMBERSHIP_ERRORS.GENERIC,
      throttled: (retry) =>
        `That's a few too many changes. Try again in ${retry}.`,
    },
    limiter: "invitation-write",
  });
}

/**
 * Better Auth's `APIError` codes, translated into this path's own vocabulary.
 *
 * **Every reachable code is handled and an unhandled one still returns a typed
 * result** (AGENTS.md 10 rule 2) — the fall-through is the generic message, and
 * nothing throws to the client. Read from
 * `node_modules/better-auth/dist/plugins/organization/error-codes.mjs`, not
 * recalled (AGENTS.md 12 rule 2).
 */
function translateOrganizationError(error: unknown): string {
  if (isAPIError(error)) {
    switch (error.body?.code) {
      case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
        return MEMBERSHIP_ERRORS.ALREADY_MEMBER;
      case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
        return MEMBERSHIP_ERRORS.ALREADY_INVITED;
      case "INVITATION_LIMIT_REACHED":
        return MEMBERSHIP_ERRORS.INVITATION_LIMIT;
      case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
        return MEMBERSHIP_ERRORS.MEMBERSHIP_LIMIT;
      case "INVITATION_NOT_FOUND":
        return MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND;
      case "MEMBER_NOT_FOUND":
        return MEMBERSHIP_ERRORS.MEMBER_NOT_FOUND;
      case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER":
        return MEMBERSHIP_ERRORS.LAST_OWNER;
      case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
        return MEMBERSHIP_ERRORS.NOT_RECIPIENT;
      case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
      case "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION":
        return MEMBERSHIP_ERRORS.VERIFY_EMAIL;
      case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION":
      case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE":
      case "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION":
      case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER":
        /* Unreachable from here — stage d already refused a non-owner. Handled
           anyway, so a future caller that skips the gate still gets a sentence
           rather than an exception. */
        return MEMBERSHIP_ERRORS.NOT_OWNER;
    }
  }
  /* Anything else leaves as a safe generic message with **nothing logged** — no
     address, no name, no organisation, no payload (AGENTS.md 8.3 rule 2). */
  return MEMBERSHIP_ERRORS.GENERIC;
}

/**
 * Invite someone into the caller's organisation — the write step 8 deferred.
 *
 * **The same stage order as `createOrganization` above**, in AGENTS.md 10's
 * letters. Stage **a** is absent for the reason written there and not restated.
 *
 * **No organisation id and no user id is ever taken from the browser.** The
 * tenant comes from the resolved membership, the inviter from the session. A
 * tenant identifier accepted from a request is the whole multi-tenancy failure
 * in one line.
 *
 * **Owner-only, checked here.** Hiding the form on `/account` is presentation
 * and is not enforcement (AGENTS.md 11.2 rule 2). The plugin checks its own
 * permission too; that is a second lock on the same door, not a reason to skip
 * this one.
 */
export async function inviteMember(
  input: unknown,
): Promise<SubmitResult<InviteMemberField>> {
  // -- a. BotID: absent on an authenticated path. See `createOrganization`. --

  // -- b. Session, tenant, then the rate limit ------------------------------
  const resolved = await resolveMembershipForWrite();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  // -- c. Parse, with the same schema the leaf ran --------------------------
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: MEMBERSHIP_ERRORS.INVALID,
      fieldErrors: fieldErrorsFrom(parsed.error, NO_INVITE_FIELD_ERRORS),
    };
  }

  // -- d. Authorise ---------------------------------------------------------
  if (membership.role !== "owner") {
    return { ok: false, error: MEMBERSHIP_ERRORS.NOT_OWNER };
  }

  // -- e/f. Write, and the email the plugin sends for us --------------------
  try {
    await getAuth().api.createInvitation({
      body: {
        email: parsed.data.email,
        role: parsed.data.role,
        /* The resolved tenant, never a value from the request. Passed
           explicitly rather than left to the session's active organisation, so
           this write lands where this action authorised. */
        organizationId: membership.organization.id,
      },
      headers: await headers(),
    });
  } catch (error) {
    const message = translateOrganizationError(error);
    /* An address that is already a member or already invited is a **field**
       error: it names the one input the person can fix. */
    if (
      message === MEMBERSHIP_ERRORS.ALREADY_MEMBER ||
      message === MEMBERSHIP_ERRORS.ALREADY_INVITED
    ) {
      return {
        ok: false,
        error: MEMBERSHIP_ERRORS.INVALID,
        fieldErrors: { email: message },
      };
    }
    return { ok: false, error: message };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Withdraw a pending invitation.
 *
 * **The id is re-checked against the resolved tenant before it is used.** An id
 * from a browser is a claim, not a capability: the pending set for *this*
 * organisation is read from the data layer and the id has to be in it. Better
 * Auth would resolve the invitation's own organisation and check permission
 * there, which is safe on its own; this refuses before that, so a caller can
 * never learn from a response that some other organisation's invitation exists.
 */
export async function cancelInvitation(
  input: unknown,
): Promise<SubmitResult> {
  const resolved = await resolveMembershipForWrite();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const parsed = cancelInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
  }

  if (membership.role !== "owner") {
    return { ok: false, error: MEMBERSHIP_ERRORS.NOT_OWNER };
  }

  try {
    const pending = await listPendingInvitations(membership.organization.id);
    if (!pending.some((row) => row.id === parsed.data.invitationId)) {
      return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
    }

    await getAuth().api.cancelInvitation({
      body: { invitationId: parsed.data.invitationId },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: translateOrganizationError(error) };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Remove someone from the caller's organisation.
 *
 * **The member id is re-checked against the resolved tenant**, for the reason
 * `cancelInvitation` records. The endpoint takes `memberIdOrEmail`; this always
 * passes the id, so an address a browser supplied can never select the row.
 *
 * **A membership row is deleted, not soft-deleted, and that is the plugin's
 * behaviour rather than a decision made here.** AGENTS.md 9.2 rule 5 is about
 * data a person can ask to have erased; the person's `user` row, their
 * activity data and the organisation are all untouched. Removing a member is
 * revoking access, and re-inviting them restores it.
 */
export async function removeMember(input: unknown): Promise<SubmitResult> {
  const resolved = await resolveMembershipForWrite();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: MEMBERSHIP_ERRORS.MEMBER_NOT_FOUND };
  }

  if (membership.role !== "owner") {
    return { ok: false, error: MEMBERSHIP_ERRORS.NOT_OWNER };
  }

  try {
    const members = await listMembersForOrganization(membership.organization.id);
    if (!members.some((row) => row.id === parsed.data.memberId)) {
      return { ok: false, error: MEMBERSHIP_ERRORS.MEMBER_NOT_FOUND };
    }

    await getAuth().api.removeMember({
      body: {
        memberIdOrEmail: parsed.data.memberId,
        organizationId: membership.organization.id,
      },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: translateOrganizationError(error) };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * Leave the organisation this account belongs to.
 *
 * **The one action here with no owner gate**, and the exception is deliberate:
 * a member may always leave. The last owner may not, and **the plugin enforces
 * that** by counting owners inside the endpoint
 * (`crud-members.mjs:403-411`) — so the rule is translated here rather than
 * duplicated, which is what keeps one enforcement point rather than two that
 * can disagree.
 *
 * It takes no input at all: the organisation is the resolved one, and there is
 * nothing a browser could usefully say about which membership to end.
 */
export async function leaveOrganization(): Promise<SubmitResult> {
  const resolved = await resolveMembershipForWrite();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  try {
    await getAuth().api.leaveOrganization({
      body: { organizationId: membership.organization.id },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: translateOrganizationError(error) };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * `setAlertEmailPreference`'s stage **b**, in the same one-gate shape the four
 * membership actions above use — prompt 122 moved its options out of the call
 * body so every gate call in this file reads the same way.
 *
 * Its sentences are the alert flow's own; only `organizationLocked` is borrowed
 * from `MEMBERSHIP_ERRORS`, unchanged.
 */
async function resolveAlertPreferenceTenant() {
  return resolveTenant({
    messages: {
      signedOut: ALERT_PREFERENCE_ERRORS.SIGNED_OUT,
      noOrganization: ALERT_PREFERENCE_ERRORS.NO_ORGANIZATION,
      organizationLocked: MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED,
      failure: ALERT_PREFERENCE_ERRORS.GENERIC,
      throttled: (retry) =>
        `That's a few too many changes. Try again in ${retry}.`,
    },
    limiter: "alert-preference",
  });
}

/**
 * Turn alert email on or off for this account, in its current organisation —
 * build step 14.
 *
 * **The same stage order as `createOrganization` above it**, in AGENTS.md 10's
 * letters: no BotID on an authenticated path, session and tenant, then the rate
 * limit keyed by user id and failing closed, then `safeParse` with the shared
 * schema, then a tenant-predicated write, then `revalidatePath`, then a typed
 * result. **No redirect on success** (10 rule 5).
 *
 * **It writes only the calling account's own row**, and takes no user id and no
 * organisation id from the browser — both are resolved server-side from the
 * session and the membership. A tenant identifier accepted from a request is the
 * whole multi-tenancy failure in one line.
 *
 * **Turning alerts off is not enforcement by absence.** The sweep re-reads this
 * preference in `listAlertRecipients`'s own predicate, server-side, every night
 * (AGENTS.md 11.2 rule 2 — hiding a control is presentation).
 */
export async function setAlertEmailPreference(
  input: unknown,
): Promise<AlertPreferenceResult> {
  // -- a. BotID: absent on an authenticated path. See `createOrganization`. --

  // -- b. Session and tenant, then the rate limit ---------------------------
  /* The lock is the shared helper's — prompt 73's reasoning holds here too: a
     workspace being erased raises no alerts (the sweep skips it,
     `listAllOrganizationIds`), so there is no preference to express about it
     until it is restored. */
  const resolved = await resolveAlertPreferenceTenant();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  // -- c. Parse, with the same schema the leaf ran --------------------------
  const parsed = alertPreferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: ALERT_PREFERENCE_ERRORS.INVALID };
  }

  // -- d/e. Authorise and write, predicated on the resolved tenant ----------
  try {
    await setAlertPreference(
      membership.organization.id,
      membership.account.user.id,
      parsed.data.emailAlerts,
    );
  } catch {
    return { ok: false, error: ALERT_PREFERENCE_ERRORS.GENERIC };
  }

  revalidatePath("/account");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Deletion and erasure — prompt 73                                          */
/* -------------------------------------------------------------------------- */

/**
 * Stage **b** for the two deletion actions, in one place.
 *
 * **The same gate every other action here calls, in its `allow-locked` mode**,
 * and that mode is the whole design: every other caller refuses a locked
 * organisation, and `restore` is the one thing a locked organisation must still
 * be able to do. Enforcing the lock here would make the reversal unreachable
 * the moment it is set — a state with no exit.
 *
 * **Prompt 122 collapsed 45 lines into this call.** The gate resolves the
 * session and the tenant, skips the lock, runs the owner check, then spends the
 * deletion limiter — in that order, and failing closed on a limiter error as
 * every authenticated path here does (AGENTS.md 8.2 rule 4 — the failure must
 * be visible, never a silent success).
 *
 * Not exported: a `"use server"` module's runtime exports must all be async
 * functions, and this is a helper rather than an entry point.
 */
async function resolveOwnerForDeletion() {
  return resolveTenant({
    /* **The one place in the codebase that spells this**, which is the point of
       making it a mode rather than leaving the exception implicit in a private
       45-line helper (prompt 122). `organizationLocked` below is unreachable
       under it, and is present because one sentence set is one type. */
    lock: "allow-locked",
    /* **Owner-only, and it runs before the limiter.** Hiding the control on
       `/account` is presentation and is never the check (AGENTS.md 11.2
       rule 2); the role was re-read from Postgres by `getCurrentMembership` on
       this request rather than trusted from the session payload (11.2 rule 5).
       The order matters: a non-owner probing the control must not spend the
       owner's deletion budget. */
    authorize: (membership) =>
      membership.role === "owner"
        ? null
        : ORGANIZATION_DELETION_ERRORS.NOT_OWNER,
    messages: {
      signedOut: ORGANIZATION_DELETION_ERRORS.SIGNED_OUT,
      noOrganization: ORGANIZATION_DELETION_ERRORS.NO_ORGANIZATION,
      organizationLocked: MEMBERSHIP_ERRORS.ORGANIZATION_LOCKED,
      failure: ORGANIZATION_DELETION_ERRORS.GENERIC,
      throttled: (retry) =>
        `That's a few too many attempts. Try again in ${retry}.`,
    },
    limiter: "organization-deletion",
  });
}

/**
 * Schedule the caller's organisation for deletion — prompt 73, closing
 * AGENTS.md 9.2 rule 5 and 8.3 rule 5 for the largest object in the schema.
 *
 * **The same stage order as every action above it**, in AGENTS.md 10's letters.
 * Stage **a** is absent for the reason `createOrganization` records and does
 * not restate.
 *
 * **No organisation id is ever taken from the browser.** The tenant is the one
 * on the resolved membership row; the only thing that crosses the boundary is a
 * typed confirmation string, and it is compared against the slug on that row.
 *
 * **It writes a lock, not a deletion.** The workspace refuses every read and
 * write from this moment (`lib/auth/organization.ts`, `lib/auth/tenant.ts`) and
 * stays restorable until the stored `scheduled_purge_at`, when the nightly
 * sweep erases it. That is what makes an erasure request one reversible
 * operation with an audit trail rather than an immediate cascade.
 */
export async function requestOrganizationDeletion(
  input: unknown,
): Promise<SubmitResult<DeleteOrganizationField>> {
  // -- a. BotID: absent on an authenticated path. See `createOrganization`. --

  // -- b. Session, tenant, role, then the rate limit ------------------------
  const resolved = await resolveOwnerForDeletion();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  // -- c. Parse, with the same schema the leaf ran --------------------------
  const parsed = deleteOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: MEMBERSHIP_ERRORS.INVALID,
      fieldErrors: fieldErrorsFrom(
        parsed.error,
        NO_DELETE_ORGANIZATION_FIELD_ERRORS,
      ),
    };
  }

  /* The confirmation. **Compared against the resolved membership row's slug**,
     which came from Postgres on this request — never against a value the
     browser also supplied, which would confirm nothing. Both sides are already
     lowercased: the schema lowercases the typed value, and the slug column is
     written lowercased by `createOrganizationSchema`. */
  if (parsed.data.confirmSlug !== membership.organization.slug) {
    return {
      ok: false,
      error: MEMBERSHIP_ERRORS.INVALID,
      fieldErrors: {
        confirmSlug: ORGANIZATION_DELETION_ERRORS.SLUG_MISMATCH,
      },
    };
  }

  // -- d/e. Authorise and write --------------------------------------------
  /* The role gate ran at stage b, where the limiter needed the membership.
     The write is next; nothing between them can change the answer. */
  const scheduledPurgeAt = new Date(
    Date.now() + ORGANIZATION_DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  let created: Awaited<ReturnType<typeof createDeletionRequest>>;
  try {
    created = await createDeletionRequest({
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      organizationSlug: membership.organization.slug,
      requestedBy: membership.account.user.id,
      scheduledPurgeAt,
    });
  } catch {
    /* Nothing logged: the payload, the slug and the organisation's name are a
       customer's commercial data (AGENTS.md 8.3 rule 2, extended by 5.3). */
    return { ok: false, error: ORGANIZATION_DELETION_ERRORS.GENERIC };
  }

  /* `null` means the partial unique index refused a second open request — two
     owners racing, or a double submit. An honest handled result, not an error
     (10 rule 2). */
  if (!created) {
    return { ok: false, error: ORGANIZATION_DELETION_ERRORS.ALREADY_PENDING };
  }

  // -- f. Tell the owners, best-effort --------------------------------------
  /* **A failed email never fails the write** (AGENTS.md 10 rule 4). The lock is
     already in place and `/account` renders it, so a message that did not leave
     costs an owner nothing. Awaited rather than fired and forgotten so a
     serverless instance is not frozen mid-send; each send returns rather than
     throws, and nothing about a failure is logged here. */
  try {
    const owners = await listOwnerEmails(membership.organization.id);
    for (const owner of owners) {
      await sendOrganizationDeletionNotice({
        deletionId: created.id,
        organizationName: created.organizationName,
        scheduledPurgeAt: created.scheduledPurgeAt,
        to: owner.email,
      });
    }
  } catch {
    /* Swallowed deliberately and silently, for the reason above. */
  }

  /* **No redirect** (10 rule 5). `/account` is where the person already is, and
     it re-renders into its locked state in place. */
  revalidatePath("/account");
  return { ok: true };
}

/**
 * Reverse an open deletion request, unlocking the workspace.
 *
 * **The one action a locked organisation may run**, which is why it resolves
 * membership through `resolveOwnerForDeletion` rather than the lock-aware
 * helper the membership actions share. Without this exception the lock would be
 * a state with no exit.
 *
 * It takes **no input at all**: the organisation is the resolved one, and there
 * is nothing a browser could usefully say about which request to reverse. A
 * request whose purge has already run cannot be reached — the membership row it
 * would be resolved from went with the cascade.
 */
export async function restoreOrganization(): Promise<SubmitResult> {
  const resolved = await resolveOwnerForDeletion();
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { membership } = resolved;

  try {
    /* Read first so "there was nothing to restore" is told apart from "the
       update matched nothing", and predicated on the resolved tenant. */
    const pending = await getPendingDeletion(membership.organization.id);
    if (!pending) {
      return { ok: false, error: ORGANIZATION_DELETION_ERRORS.NOT_PENDING };
    }

    const cancelled = await cancelDeletionRequest(
      membership.organization.id,
      membership.account.user.id,
    );
    if (!cancelled) {
      /* Another owner restored it between the read and the write. The state the
         person wanted is the state that holds, so this is not a failure. */
      revalidatePath("/account");
      return { ok: true };
    }
  } catch {
    return { ok: false, error: ORGANIZATION_DELETION_ERRORS.GENERIC };
  }

  /* No email on restore: every owner was told the date, and the workspace they
     can now open says the rest. AGENTS.md 8.3 rule 1 — only what the flow
     needs. */
  revalidatePath("/account");
  return { ok: true };
}
