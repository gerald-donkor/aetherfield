"use server";

import { ipAddress, waitUntil } from "@vercel/functions";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";

import { getJob } from "../_content/jobs";
import { insertApplication } from "../../lib/db/application-queries";
import { sendApplicationEmails } from "../../lib/email/application";
import { checkLimit, formatRetry } from "../../lib/rate-limit";
import { deleteCv, putCv, sanitiseFilename } from "../../lib/storage/cv";
import {
  applicationFieldsSchema,
  CV_ACCEPT,
  CV_ERRORS,
  CV_MAX_BYTES,
  NO_FIELD_ERRORS,
  type ApplicationSubmitResult,
} from "../../lib/validation/application";
import { fieldErrorsFrom } from "../../lib/validation/result";

/**
 * Job applications — build step 5.
 *
 * **A copy of `app/_actions/demo-request.ts`, not an invention.** Step 2
 * established the write path AGENTS.md 10 specifies and said in terms that
 * steps 4 and 5 copy its shape; the stages below carry 10's own letters, in
 * 10's own order. Every deviation is named where it happens, and there are
 * three: the input is `FormData` rather than a plain object, stage c validates
 * a slug and a file on top of the shared schema, and stage e is a two-part
 * write whose first part is rolled back by hand if the second fails.
 *
 * Lives in `app/_actions/` rather than `app/<route>/actions.ts` because 6.3's
 * colocation rule assumes one owning route and this form has four trigger
 * sites across two route trees — `/careers`'s open-application card and each
 * `/job-listing/[slug]`.
 *
 * ## Why `FormData`, and what was rejected
 *
 * Steps 2 and 4 hand their actions a plain object. **This one takes `FormData`
 * because the CV travels in it** — a `File` survives the Server Action
 * boundary inside a multipart body, and nothing else about the flow changes.
 *
 * The rejected alternative is `@vercel/blob/client`'s `upload()`. It would need
 * a Route Handler that hands a *write capability* to an unauthenticated browser
 * on a public marketing page, and AGENTS.md 6.2 reserves Route Handlers for
 * callers that are not this application. The server-side `put()` in
 * `lib/storage/cv.ts` keeps one mutation path and never gives the browser a
 * token. The cost is Next's Server Action body limit, raised in
 * `next.config.ts` for exactly this reason.
 *
 * **Nothing personal is ever logged** (AGENTS.md 8.3 rule 2) — not the body,
 * not the address, not the filename, not the blob pathname, not on the success
 * path and not in a catch. There is no `console` call in this file.
 */

const GENERIC_FAILURE =
  "We couldn't record that application. Please try again in a moment.";

const FIELD_FAILURE = "Check the marked fields and try again.";

export async function submitApplication(
  formData: FormData,
): Promise<ApplicationSubmitResult> {
  // -- a. BotID -----------------------------------------------------------
  // Local development always classifies as human; the real check runs on
  // Vercel. `instrumentation-client.ts` names the paths this covers, and a
  // path missing from that list makes this call fail rather than pass —
  // `/careers` and `/job-listing/*` were added there in the same change as
  // this file.
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return { ok: false, error: GENERIC_FAILURE };
    }
  } catch {
    // Fails closed, as steps 2 and 4 do.
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
    const limit = await checkLimit("application", ip);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `That's a few too many requests. Try again in ${formatRetry(
          limit.retryAfterSeconds,
        )}.`,
      };
    }
  } catch {
    // Fails closed: an unlimited public *upload* path is a worse outcome than
    // a form that is briefly unavailable, and 8.2 rule 4 requires the failure
    // be visible rather than a silent success.
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- c. Parse, with the same schema the leaf ran -------------------------
  /* The three typed fields go through the shared schema, so the rules exist
     once and run twice (AGENTS.md 10 rule 1). `FormData.get` returns
     `FormDataEntryValue | null`; the schema is the thing that decides what a
     missing or non-string entry means, so the two required values are handed to
     it raw rather than coerced here — a missing `name` should fail the schema,
     not be quietly rewritten into an empty string.

     **`message` is the one exception, and it has to be.** The schema marks it
     `.optional()`, which accepts `undefined` and rejects `null` — so a request
     that simply omits the textarea would fail the *whole* form on its one
     optional field. `?? undefined` is the coercion that makes "absent" and
     "empty" mean the same thing, which is what optional already means to
     everyone reading the form. */
  const parsed = applicationFieldsSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: fieldErrorsFrom(parsed.error, NO_FIELD_ERRORS),
    };
  }

  /* `jobSlug` is composed on the server, exactly as step 2 composes `source`,
     and validated against `JOBS` in `app/_content/jobs.ts` — **a reference,
     not a foreign key** (AGENTS.md 9.2 rule 1). There is no `job` table, and
     an application must survive the role being closed and removed from that
     file, so the check happens here and the stored value is a plain string.

     **A bad slug produces no field error.** It is not a field a person types:
     the leaf is handed the slug by the page it is mounted on, so a value that
     is not in `JOBS` is a forged request rather than a typo, and the generic
     failure is the right answer to it. */
  const jobSlug = formData.get("jobSlug");
  const job = typeof jobSlug === "string" ? getJob(jobSlug) : undefined;
  if (!job) {
    return { ok: false, error: GENERIC_FAILURE };
  }

  /* The file is checked on the server and the server check is the only one
     that counts (AGENTS.md 6.2). Four gates, cheapest first — presence, then
     size, then the declared type, then the bytes.

     **The declared `type` is not trusted on its own.** It is written by the
     browser from the file's extension and is attacker-controlled, so the last
     gate reads the leading five bytes and requires the `%PDF-` signature
     (AGENTS.md 8.2 rule 3). `File.slice().arrayBuffer()` is verified present in
     this runtime (Node v26.5.1) rather than assumed, and slicing means the
     whole file is never pulled into memory to check a header. */
  const cv = formData.get("cv");
  if (!(cv instanceof File) || cv.size === 0) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { cv: CV_ERRORS.missing },
    };
  }
  if (cv.size > CV_MAX_BYTES) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { cv: CV_ERRORS.size },
    };
  }
  if (cv.type !== CV_ACCEPT) {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { cv: CV_ERRORS.type },
    };
  }
  let signature: string;
  try {
    signature = new TextDecoder().decode(await cv.slice(0, 5).arrayBuffer());
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }
  if (signature !== "%PDF-") {
    return {
      ok: false,
      error: FIELD_FAILURE,
      fieldErrors: { cv: CV_ERRORS.type },
    };
  }

  // -- d. Authorise -------------------------------------------------------
  // Skipped: this path is public by design (AGENTS.md 11). Step 7's reads are
  // the authorised half of this feature, and the CV is reachable only through a
  // short-lived signed URL minted there for an authorised session.

  // -- e. Write -----------------------------------------------------------
  /* **Put, then insert, and the order is forced**: `application.cv_pathname` is
     `notNull`, so the row cannot be written before the blob exists.

     That makes the blob the uncommitted half for the length of one insert, so a
     failed insert deletes it. `deleteCv` is best-effort and throws nothing —
     the worst case is an orphaned private object, and the worst case of *not*
     trying is one on every failed submission. Neither branch logs: not the
     pathname, not the filename, not the address (AGENTS.md 8.3 rule 2). */
  let pathname: string;
  try {
    pathname = await putCv(cv);
  } catch {
    return { ok: false, error: GENERIC_FAILURE };
  }

  const cvFilename = sanitiseFilename(cv.name);

  let applicationId: string;
  try {
    applicationId = await insertApplication({
      jobSlug: job.slug,
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message ?? null,
      cvPathname: pathname,
      cvFilename,
    });
  } catch {
    await deleteCv(pathname);
    return { ok: false, error: GENERIC_FAILURE };
  }

  // -- f. Email -----------------------------------------------------------
  /* **A failed email never fails the write** (AGENTS.md 10 rule 4). The
     application is committed above; everything below this line is best-effort
     and cannot reach the returned `ApplicationSubmitResult`.
     `sendApplicationEmails` returns void, throws nothing, and logs its own
     failures without an address.

     **Handed to `waitUntil`, not awaited**, for the reason steps 3 and 4
     recorded: the dialog swaps to its success state on this result, and making
     a person wait on a third party for work that is explicitly best-effort is
     backwards — the application is already safe. Outside a Vercel request
     context `waitUntil` is a no-op and the already-started promise floats,
     which is why the sends are still observable against `next dev`.

     `role` is resolved from `JOBS` rather than passed up from the browser: the
     email names the role the person applied to, and the human-readable label
     belongs to the same constant the slug was just validated against. */
  waitUntil(
    sendApplicationEmails({
      applicationId,
      jobSlug: job.slug,
      role: job.role,
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message ?? null,
      cvFilename,
    }),
  );

  return { ok: true };
}
