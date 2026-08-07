"use server";

import { ipAddress, waitUntil } from "@vercel/functions";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";
import * as z from "zod";

import { insertLead } from "../../lib/db/lead-queries";
import { sendDemoRequestEmails } from "../../lib/email/demo-request";
import { leadSource } from "../../lib/db/schema";
import { checkDemoRequestLimit } from "../../lib/rate-limit";
import {
  demoRequestFieldsSchema,
  type SubmitResult,
} from "../../lib/validation/lead";

/**
 * Demo-request capture — build step 2, and the write path AGENTS.md 10
 * specifies. **Steps 4 and 5 copy this file's shape rather than inventing
 * their own**, so the stages below are labelled with 10's own letters.
 *
 * Lives in `app/_actions/` rather than `app/<route>/actions.ts`: 6.3's
 * colocation rule assumes one owning route, and this form is opened from shared
 * chrome on more than one page. `app/_actions/` follows the existing
 * `app/_components/` and `app/_content/` convention for shared, non-routable
 * code, and 6.3's tree is amended to name it.
 *
 * **Nothing personal is ever logged** (AGENTS.md 8.3 rule 2) — not the body,
 * not the address, not on the success path and not in a catch.
 */

/* `source` is the one field the person never types, so it is validated here
   rather than in the browser-safe schema: composing it on the server keeps
   `drizzle-orm/pg-core` out of `/`'s bundle while still deriving the union from
   the database enum rather than re-declaring it (AGENTS.md 9.2 rule 2). */
const demoRequestSchema = demoRequestFieldsSchema.extend({
  source: z.enum(leadSource.enumValues),
});

const GENERIC_FAILURE =
  "We couldn't record that request. Please try again in a moment.";

export async function submitDemoRequest(
  input: unknown,
): Promise<SubmitResult> {
  // -- a. BotID -----------------------------------------------------------
  // Local development always classifies as human; the real check runs on
  // Vercel. `instrumentation-client.ts` names the paths this covers, and a
  // path missing from that list makes this call fail rather than pass.
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return { ok: false, error: GENERIC_FAILURE };
    }
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- b. Rate limit, keyed by IP -----------------------------------------
  // `x-real-ip` as Vercel Proxy calculates it, read through `ipAddress()`
  // rather than parsing `x-forwarded-for` by hand — a client can write that
  // header and cannot write this one.
  /* Wrapped as `{ headers }` rather than passed bare. `ipAddress` does
     `"headers" in input ? input.headers : input`, and Next 16's headers object
     *has* a `headers` property that is not itself a `Headers` — passing it
     directly throws `headers.get is not a function`. The wrapper hits the
     documented `Request`-shaped branch. */
  const ip = ipAddress({ headers: await headers() }) ?? "unknown";
  try {
    const limit = await checkDemoRequestLimit(ip);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many requests. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed: an unlimited public write path is a worse outcome than a
    // form that is briefly unavailable, and 8.2 rule 4 requires the failure be
    // visible rather than a silent success.
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- c. Parse, with the same schema the leaf ran -------------------------
  const parsed = demoRequestSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      ok: false,
      error: "Check the marked fields and try again.",
      fieldErrors: {
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
        company: fieldErrors.company?.[0],
        message: fieldErrors.message?.[0],
      },
    };
  }

  // -- d. Authorise -------------------------------------------------------
  // Skipped: this path is public by design (AGENTS.md 11). Step 7's reads are
  // the authorised half of this feature.

  // -- e. Write -----------------------------------------------------------
  let leadId: string;
  try {
    leadId = await insertLead({
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company,
      message: parsed.data.message ?? null,
      source: parsed.data.source,
    });
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- f. Email -----------------------------------------------------------
  /* **A failed email never fails the write** (AGENTS.md 10 rule 4). The lead
     is committed above; everything below this line is best-effort and cannot
     reach the returned `SubmitResult`. `sendDemoRequestEmails` returns void,
     throws nothing, and logs its own failures without an address.

     **Handed to `waitUntil`, not awaited, and that is a judgement.** There is
     no deployment to measure a send against (`docs/backend.md`), so nothing
     here is fitted. The reasoning: the dialog swaps to its success state on
     this result, and making a person wait on a third party for work that is
     explicitly best-effort is backwards — the lead is already safe. Outside a
     Vercel request context `waitUntil` is a no-op and the already-started
     promise simply floats, which is why the sends are still observable
     against `next dev` (verified in `@vercel/functions@3.8.0`,
     `get-context.js`: `globalThis[Symbol.for("@vercel/request-context")]`). */
  waitUntil(
    sendDemoRequestEmails({
      leadId,
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company,
      message: parsed.data.message ?? null,
      source: parsed.data.source,
    }),
  );

  return { ok: true };
}

/** Retry timing in the site's measured register — "4 minutes", not "241s". */
function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
