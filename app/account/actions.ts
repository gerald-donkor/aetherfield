"use server";

import { isAPIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import * as z from "zod";

import { getAuth, getCurrentAccount } from "../../lib/auth/server";
import {
  checkOrganizationCreateLimit,
  formatRetry,
} from "../../lib/rate-limit";
import {
  type CreateOrganizationField,
  createOrganizationSchema,
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
