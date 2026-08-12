"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as z from "zod";

import {
  type CurrentMembership,
  getCurrentMembership,
} from "../../lib/auth/organization";
import { getAuth, getCurrentAccount } from "../../lib/auth/server";
import { setAlertPreference } from "../../lib/db/alert-queries";
import {
  listMembersForOrganization,
  listPendingInvitations,
} from "../../lib/db/organization-queries";
import {
  checkAlertPreferenceLimit,
  checkInvitationWriteLimit,
  checkOrganizationCreateLimit,
  formatRetry,
} from "../../lib/rate-limit";
import {
  ALERT_PREFERENCE_ERRORS,
  alertPreferenceSchema,
  type AlertPreferenceResult,
} from "../../lib/validation/alerts";
import {
  cancelInvitationSchema,
  type CreateOrganizationField,
  createOrganizationSchema,
  type InviteMemberField,
  inviteMemberSchema,
  MEMBERSHIP_ERRORS,
  removeMemberSchema,
} from "../../lib/validation/organization";
import type { SubmitResult } from "../../lib/validation/result";

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
    const limit = await checkOrganizationCreateLimit(account.user.id);
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
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Check the marked fields and try again.",
      fieldErrors: {
        name: fieldErrors.name?.[0],
        slug: fieldErrors.slug?.[0],
      },
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
 * It resolves the session and the tenant, then spends the rate limit — in that
 * order, because the limit is keyed by the user id and there is no key without
 * the session (the reason `createOrganization` gives above). It **fails closed**
 * on a limiter error, as every authenticated path here does: an unlimited write
 * path is worse than a control that is briefly unavailable, and AGENTS.md 8.2
 * rule 4 wants the failure visible rather than a silent success.
 *
 * Not exported. A `"use server"` module's runtime exports must all be async
 * functions, and this is a helper rather than an entry point.
 */
async function resolveMembershipForWrite(): Promise<
  { ok: true; membership: CurrentMembership } | { ok: false; error: string }
> {
  let membership: CurrentMembership | null;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }
  if (!membership) {
    /* Two ordinary states, told apart so the message is honest: signed out, or
       signed in with no organisation to manage. */
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account
        ? MEMBERSHIP_ERRORS.NO_ORGANIZATION
        : MEMBERSHIP_ERRORS.SIGNED_OUT,
    };
  }

  try {
    const limit = await checkInvitationWriteLimit(membership.account.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }

  return { ok: true, membership };
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
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: MEMBERSHIP_ERRORS.INVALID,
      fieldErrors: {
        email: fieldErrors.email?.[0],
        role: fieldErrors.role?.[0],
      },
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
  let membership: Awaited<ReturnType<typeof getCurrentMembership>>;
  try {
    membership = await getCurrentMembership();
  } catch {
    return { ok: false, error: ALERT_PREFERENCE_ERRORS.GENERIC };
  }
  if (!membership) {
    /* Two ordinary states, told apart so the message is honest: signed out, or
       signed in with no organisation to receive alerts about. */
    const account = await getCurrentAccount().catch(() => null);
    return {
      ok: false,
      error: account
        ? ALERT_PREFERENCE_ERRORS.NO_ORGANIZATION
        : ALERT_PREFERENCE_ERRORS.SIGNED_OUT,
    };
  }

  try {
    const limit = await checkAlertPreferenceLimit(membership.account.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed, as every authenticated path beside it does.
    return { ok: false, error: ALERT_PREFERENCE_ERRORS.GENERIC };
  }

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
