"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuth, getCurrentAccount } from "../../../lib/auth/server";
import {
  getInvitationForLink,
  getMembership,
} from "../../../lib/db/organization-queries";
import { checkLimit, formatRetry } from "../../../lib/rate-limit";
import {
  invitationResponseSchema,
  MEMBERSHIP_ERRORS,
} from "../../../lib/validation/organization";
import type { SubmitResult } from "../../../lib/validation/result";

/**
 * Accepting and declining an invitation — prompt 63.
 *
 * **Colocated with the route that owns it** (AGENTS.md 6.3), and the same stage
 * order as `app/account/actions.ts`, in AGENTS.md 10's letters:
 *
 * - **a.** BotID is absent, for the reason `createOrganization` records: this
 *   path requires a live session, which is a stronger gate than a bot
 *   heuristic, and adding a path to `instrumentation-client.ts` is a two-file
 *   commitment (AGENTS.md 7.3) this prompt deliberately does not make.
 * - **b.** the session, then a rate limit keyed by the responding user's id,
 *   failing closed.
 * - **c.** `safeParse` with the shared schema.
 * - **d.** the invited address is the only address that may respond — the
 *   plugin enforces it inside both endpoints (`crud-invites.mjs:269` and
 *   `:380`), and this action refuses first so a mismatch is a sentence rather
 *   than an exception. An accept additionally refuses when the caller is
 *   already a member, which the plugin checks nowhere — see the comment there
 *   and the unique index on `member` in `lib/db/auth-schema.ts`.
 * - **e.** the plugin's own endpoint does the write.
 *
 * **No redirect** (AGENTS.md 10 rule 5): the page swaps to its outcome in place
 * and the leaf renders this typed result.
 *
 * **Nothing personal is logged** — no address, no organisation name, no payload.
 */
export async function respondToInvitation(
  input: unknown,
): Promise<SubmitResult> {
  // -- b. Session, then the rate limit --------------------------------------
  let account: Awaited<ReturnType<typeof getCurrentAccount>>;
  try {
    account = await getCurrentAccount();
  } catch {
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }
  if (!account) return { ok: false, error: MEMBERSHIP_ERRORS.SIGNED_OUT };

  try {
    const limit = await checkLimit("invitation-response", account.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many attempts. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed, as every authenticated path on this site does.
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }

  // -- c. Parse, with the same schema the leaf ran --------------------------
  const parsed = invitationResponseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
  }
  const { invitationId, decision } = parsed.data;

  // -- d. The invited address, and only it ----------------------------------
  let invitation: Awaited<ReturnType<typeof getInvitationForLink>>;
  try {
    invitation = await getInvitationForLink(invitationId);
  } catch {
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }
  if (!invitation || invitation.status !== "pending") {
    return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
  }
  if (invitation.expired) {
    return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
  }
  /* Both sides lowercased before comparing. `invitation.email` is written
     lowercased by the schema and by the plugin, and a `user.email` that predates
     either is still compared correctly (AGENTS.md 9.2 rule 4). */
  if (invitation.email.toLowerCase() !== account.user.email.toLowerCase()) {
    return { ok: false, error: MEMBERSHIP_ERRORS.NOT_RECIPIENT };
  }
  /* Accepting twice would write a second `member` row for one pair. The plugin
     refuses this on the invite side but not on the accept side —
     `acceptInvitation` checks status, expiry, recipient, verified email and the
     membership limit, and no existing membership (`crud-invites.mjs:264-290`).
     The unique index added alongside this closes the race; this closes the
     ordinary path, so a second click reads as a sentence rather than a caught
     exception. Declining is unaffected. */
  if (decision === "accept") {
    let existing: Awaited<ReturnType<typeof getMembership>>;
    try {
      existing = await getMembership(account.user.id, invitation.organizationId);
    } catch {
      return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
    }
    if (existing) {
      return { ok: false, error: MEMBERSHIP_ERRORS.ALREADY_JOINED };
    }
  }

  // -- e. The write, through the plugin's own endpoint ----------------------
  try {
    const requestHeaders = await headers();
    if (decision === "accept") {
      await getAuth().api.acceptInvitation({
        body: { invitationId },
        headers: requestHeaders,
      });
    } else {
      await getAuth().api.rejectInvitation({
        body: { invitationId },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    if (isAPIError(error)) {
      switch (error.body?.code) {
        case "INVITATION_NOT_FOUND":
          return { ok: false, error: MEMBERSHIP_ERRORS.INVITATION_NOT_FOUND };
        case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
          return { ok: false, error: MEMBERSHIP_ERRORS.NOT_RECIPIENT };
        case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
          return { ok: false, error: MEMBERSHIP_ERRORS.VERIFY_EMAIL };
        case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
          return { ok: false, error: MEMBERSHIP_ERRORS.MEMBERSHIP_LIMIT };
      }
    }
    // Nothing logged, and never an exception string rendered (10 rule 2).
    return { ok: false, error: MEMBERSHIP_ERRORS.GENERIC };
  }

  /* Accepting changes what `/account` shows — the new membership, its roster,
     and the alert preference that comes with it. The invitation page renders
     its own outcome in place. */
  revalidatePath("/account");
  revalidatePath(`/invitation/${invitationId}`);
  return { ok: true };
}
