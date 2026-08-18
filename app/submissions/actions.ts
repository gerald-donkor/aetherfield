"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAccount } from "../../lib/auth/server";
import {
  restoreApplicationRemoval,
  softDeleteApplication,
} from "../../lib/db/application-queries";
import { setStaffRole } from "../../lib/db/auth-queries";
import { softDeleteLead } from "../../lib/db/lead-queries";
import { softDeleteSubscriber } from "../../lib/db/subscriber-queries";
import { checkLimit, formatRetry } from "../../lib/rate-limit";
import { deleteCvStrict } from "../../lib/storage/cv";
import type { SubmitResult } from "../../lib/validation/result";
import {
  staffMutationSchema,
  submissionRemovalSchema,
} from "../../lib/validation/submissions";

const GENERIC_FAILURE =
  "We couldn't make that change just now. Please try again in a moment.";
const FORBIDDEN = "You don't have permission to make that change.";
const NOT_AVAILABLE = "That item is no longer available.";

async function getAdminAccount() {
  try {
    const account = await getCurrentAccount();
    return account?.role === "admin" ? account : null;
  } catch {
    return null;
  }
}

/**
 * Stages **a**, **b** and **d** for both actions below, in one place — prompt
 * 97.
 *
 * **a. BotID: absent on an authenticated path.** The same standing decision
 * `stageImport` records, and for the same reason: BotID's client half names
 * *page* paths in `instrumentation-client.ts`, and a path missing from that
 * list makes the server call fail rather than pass (AGENTS.md 7.3). Nobody
 * without an admin session reaches either action.
 *
 * **d before b, deliberately, and it is the only correct order here.** The
 * limiter is keyed by the admin's user id and there is no key without the
 * session — the same constraint `app/account/actions.ts`'s
 * `resolveMembershipForWrite()` documents. What AGENTS.md 10 rule 3 actually
 * forbids is the *parse* running before the cheap rejections, and until this
 * prompt both actions did exactly that; parsing is now stage **c**, after both.
 *
 * **It fails closed** on a limiter error, as every authenticated write path in
 * this repository does: an unlimited admin path that deletes CV blobs is worse
 * than a control that is briefly unavailable (AGENTS.md 8.2 rule 4).
 *
 * Nothing is logged — not the user id, not the input, not the driver's message
 * (AGENTS.md 8.3 rule 2).
 *
 * Not exported: a `"use server"` module's runtime exports must all be async
 * entry points, and this is a helper.
 */
async function resolveAdminForWrite(): Promise<
  { ok: true; admin: NonNullable<Awaited<ReturnType<typeof getAdminAccount>>> }
  | { ok: false; error: string }
> {
  const admin = await getAdminAccount();
  if (!admin) return { ok: false, error: FORBIDDEN };

  try {
    const limit = await checkLimit("submission-write", admin.user.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many changes. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  return { ok: true, admin };
}

export async function changeStaffRole(input: unknown): Promise<SubmitResult> {
  // -- a, b, d. BotID, the limit and the admin check. See the helper. -------
  const gate = await resolveAdminForWrite();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { admin } = gate;

  // -- c. Parse, with the schema the leaf also ran ---------------------------
  const parsed = staffMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_FAILURE };

  try {
    const changed = await setStaffRole({
      actorId: admin.user.id,
      targetId: parsed.data.userId,
      role: parsed.data.role === "staff" ? "staff" : null,
    });
    if (!changed) return { ok: false, error: NOT_AVAILABLE };
    revalidatePath("/submissions");
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}

export async function removeSubmission(input: unknown): Promise<SubmitResult> {
  // -- a, b, d. BotID, the limit and the admin check. See the helper. -------
  const gate = await resolveAdminForWrite();
  if (!gate.ok) return { ok: false, error: gate.error };

  // -- c. Parse, with the schema the leaf also ran ---------------------------
  const parsed = submissionRemovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_FAILURE };

  try {
    if (parsed.data.kind === "lead") {
      if (!(await softDeleteLead(parsed.data.id))) {
        return { ok: false, error: NOT_AVAILABLE };
      }
    } else if (parsed.data.kind === "subscriber") {
      if (!(await softDeleteSubscriber(parsed.data.id))) {
        return { ok: false, error: NOT_AVAILABLE };
      }
    } else {
      const removed = await softDeleteApplication(parsed.data.id);
      if (!removed) return { ok: false, error: NOT_AVAILABLE };

      if (!(await deleteCvStrict(removed.pathname))) {
        await restoreApplicationRemoval(parsed.data.id, removed.removedAt);
        return { ok: false, error: GENERIC_FAILURE };
      }
    }

    revalidatePath("/submissions");
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
}
