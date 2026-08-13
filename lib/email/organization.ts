import "server-only";

import { createHash } from "node:crypto";

import {
  isOrganizationRole,
  ORGANIZATION_DELETION_WINDOW_DAYS,
  ORGANIZATION_ROLE_LABELS,
} from "../validation/organization";
import { appBaseUrl } from "./config";
import { sendEmail } from "./send";
import {
  DELETION_SUBJECT_PREFIX,
  OrganizationDeletion,
} from "./templates/organization-deletion";
import {
  INVITATION_SUBJECT_PREFIX,
  OrganizationInvitation,
} from "./templates/organization-invitation";

/**
 * The organisation invitation's send, behind one call — `lib/email/alerts.ts`'s
 * shape, for the reason step 3 gave: **a failed email never fails the write**
 * (AGENTS.md 10 rule 4). The `invitation` row is written by Better Auth's
 * endpoint before this runs; this is best-effort, and an owner whose message did
 * not leave cancels the invitation and sends another.
 *
 * **The plugin cannot be failed by this function, and that was verified rather
 * than assumed.** `createInvitation` calls it through
 * `ctx.context.runInBackgroundOrAwait`, and this project configures
 * `advanced.backgroundTasks.handler = waitUntil` (`lib/auth/server.ts`), so the
 * promise is handed to Vercel's `waitUntil` with a `.catch` already attached and
 * the endpoint never awaits it
 * (`node_modules/better-auth/dist/context/create-context.mjs:214-224`, and the
 * call site at `plugins/organization/routes/crud-invites.mjs:226`). Even with no
 * handler configured the runner's own `try`/`catch` swallows the throw. Two
 * layers, and this function still returns rather than throws — the rule is not
 * left resting on the library's implementation detail.
 *
 * **Nothing personal is logged** (AGENTS.md 8.3 rule 2). A failure line carries
 * the template name, the provider's error class and the invitation's id — never
 * the invited address, never the inviter's name, never the organisation's name.
 * The invitation id is the only identifier that appears anywhere here,
 * **including in the idempotency key**.
 */

/**
 * `<event-type>/<entity-id>` per step 3's documented format, keyed on the
 * invitation row's id: one invitation is one message.
 *
 * **The recipient is deliberately not folded in**, unlike `sendTargetAlert`'s
 * key. That one hashes the address because one threshold crossing fans out to
 * every owner, and Resend answers a repeated key carrying a different payload
 * with a 409 — so the second owner would never be told. An invitation has
 * exactly one recipient by construction, so there is no fan-out to disambiguate
 * and no hash to add. Re-inviting the same address produces a **new** invitation
 * row (`cancelPendingInvitationsOnReInvite`, `lib/auth/server.ts`), so a second
 * attempt carries a second id and a second key rather than colliding with the
 * first.
 */
function idempotencyKey(invitationId: string): string {
  return `organization-invitation/${invitationId}`;
}

/** A date in the site's register — the same "2026" the rest of the content
    ships (AGENTS.md content conventions). UTC and a fixed locale so the string
    does not depend on where the server happens to run. Used for the
    invitation's expiry and, since prompt 73, the deletion's purge date. */
function formatDate(when: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(when);
}

export type InvitationEmailInput = {
  invitationId: string;
  organizationName: string;
  inviterName: string;
  /** The stored role string, as the plugin hands it over. Narrowed to a label
      below; an unrecognised value is rendered verbatim rather than guessed at. */
  role: string;
  expiresAt: Date;
  to: string;
};

/**
 * Sends one invitation to one address.
 *
 * **Returns whether the message left**, so a caller that cares can say so. It
 * throws nothing — including when `BETTER_AUTH_URL` is unset, which is the one
 * way `appBaseUrl()` fails and would otherwise escape into the auth pipeline.
 */
export async function sendOrganizationInvitation(
  input: InvitationEmailInput,
): Promise<boolean> {
  try {
    const roleLabel = isOrganizationRole(input.role)
      ? ORGANIZATION_ROLE_LABELS[input.role]
      : input.role;

    const outcome = await sendEmail({
      to: input.to,
      subject: `${INVITATION_SUBJECT_PREFIX} ${input.organizationName}`,
      body: OrganizationInvitation({
        organizationName: input.organizationName,
        inviterName: input.inviterName,
        roleLabel,
        expiresLabel: formatDate(input.expiresAt),
        acceptUrl: `${appBaseUrl()}/invitation/${input.invitationId}`,
      }),
      idempotencyKey: idempotencyKey(input.invitationId),
      template: "organization-invitation",
    });

    if (!outcome.sent) {
      console.warn(
        `[email] send failed for invitation ${input.invitationId}: ${outcome.reason}`,
      );
      return false;
    }
    return true;
  } catch {
    console.warn(
      `[email] organization-invitation threw for invitation ${input.invitationId}`,
    );
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Deletion notice — prompt 73                                               */
/* -------------------------------------------------------------------------- */

/**
 * `<event-type>/<entity-id>` per step 3's documented format, keyed on the
 * deletion row's id **and a hash of the recipient**.
 *
 * The fan-out reasoning `sendTargetAlert` records applies exactly: one deletion
 * request goes to every owner, and Resend answers a repeated key carrying a
 * different payload with a 409 — so without the recipient in the key, the
 * second owner would never be told. The address is **hashed, never carried**
 * (AGENTS.md 8.3 rule 2): the key lands in a third party's idempotency store.
 */
function deletionKey(deletionId: string, to: string): string {
  const digest = createHash("sha256").update(to).digest("hex").slice(0, 16);
  return `organization-deletion/${deletionId}/${digest}`;
}

export type DeletionNoticeInput = {
  /** The `organization_deletion` row's id — the only identifier that appears
      in a log line on this path. */
  deletionId: string;
  organizationName: string;
  scheduledPurgeAt: Date;
  to: string;
};

/**
 * Tells one owner that their organisation is scheduled for deletion.
 *
 * **Best-effort, and a failure never fails the write** (AGENTS.md 10 rule 4).
 * The `organization_deletion` row is committed before this runs; an owner whose
 * message did not arrive still sees the locked notice and the restore control
 * on `/account`, which is the surface that actually carries the state.
 *
 * **Returns rather than throws**, including when `BETTER_AUTH_URL` is unset —
 * the one way `appBaseUrl()` fails.
 *
 * **Nothing personal is logged**: a failure line carries the template name, the
 * provider's reason and the deletion row's id. Never the address, never the
 * organisation's name.
 */
export async function sendOrganizationDeletionNotice(
  input: DeletionNoticeInput,
): Promise<boolean> {
  try {
    const outcome = await sendEmail({
      to: input.to,
      subject: `${DELETION_SUBJECT_PREFIX} ${input.organizationName}`,
      body: OrganizationDeletion({
        organizationName: input.organizationName,
        purgeLabel: formatDate(input.scheduledPurgeAt),
        windowDays: ORGANIZATION_DELETION_WINDOW_DAYS,
        accountUrl: `${appBaseUrl()}/account`,
      }),
      idempotencyKey: deletionKey(input.deletionId, input.to),
      template: "organization-deletion",
    });

    if (!outcome.sent) {
      console.warn(
        `[email] send failed for deletion ${input.deletionId}: ${outcome.reason}`,
      );
      return false;
    }
    return true;
  } catch {
    console.warn(
      `[email] organization-deletion threw for deletion ${input.deletionId}`,
    );
    return false;
  }
}
