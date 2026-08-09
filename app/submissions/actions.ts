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

export async function changeStaffRole(input: unknown): Promise<SubmitResult> {
  const parsed = staffMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_FAILURE };

  const admin = await getAdminAccount();
  if (!admin) return { ok: false, error: FORBIDDEN };

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
  const parsed = submissionRemovalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_FAILURE };

  const admin = await getAdminAccount();
  if (!admin) return { ok: false, error: FORBIDDEN };

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
