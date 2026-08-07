import "server-only";

import type { ReactElement } from "react";
import { render } from "react-email";
import { Resend } from "resend";

import { FROM, replyTo } from "./config";

/**
 * The send helper — the module every later flow imports instead of calling
 * `resend` directly (AGENTS.md 5.2: step 3 sets the pattern every later email
 * copies, as step 2 set the pattern every later form copies).
 *
 * **Lazy, for the same reason `lib/db/client.ts` and `lib/rate-limit/` are
 * lazy.** `next build` evaluates top-level module code, so a client
 * constructed at import time against an unset `RESEND_API_KEY` fails the build
 * before any route renders.
 *
 * **Nothing personal is ever logged** (AGENTS.md 8.3 rule 2). A failure
 * carries the provider's error *name* and the template's name — never the
 * recipient, never the subject, never the rendered body. `error.message` is
 * deliberately not propagated: a `validation_error` message can quote the
 * address that failed.
 */

let client: Resend | undefined;

function getResend(): Resend {
  if (client) return client;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Pull it with `vercel env pull .env.local`.",
    );
  }

  client = new Resend(apiKey);
  return client;
}

/**
 * Modelled on `RateLimitOutcome` — the caller decides what a failure means,
 * and for a demo request the answer is "nothing" (AGENTS.md 10 rule 4).
 * **This never throws to its caller.**
 */
export type SendOutcome =
  | { sent: true; id: string }
  /** Safe to log verbatim: an error class or a short internal string, never
      anything a person typed and never an address. */
  | { sent: false; reason: string };

export type SendEmail = {
  to: string;
  subject: string;
  /** The template element. Rendered to **both** parts here — see below. */
  body: ReactElement;
  /** `<event-type>/<entity-id>`, per Resend's documented format. */
  idempotencyKey: string;
  /** Logged on failure in place of anything identifying. */
  template: string;
  /** Defaults to the monitored internal address (`config.ts`). The internal
      notification overrides it with the lead's own address, so a reply from
      the team reaches the person rather than the team. */
  replyTo?: string;
};

export async function sendEmail(email: SendEmail): Promise<SendOutcome> {
  /* **Both parts are rendered here, and that is not redundant.** Verified
     against resend 6.18.1 (`node_modules/resend/dist/index.mjs:231-233`): when
     the SDK is handed `react` it sets `html` from it and sends **no `text`
     at all**. The `react-email` skill states the SDK handles both; against the
     installed version it does not. A plain-text part is required for
     accessibility and for the clients that prefer it, so it is rendered
     explicitly and `react` is never passed. */
  let html: string;
  let text: string;
  try {
    html = await render(email.body);
    text = await render(email.body, { plainText: true });
  } catch {
    return { sent: false, reason: `render-failed:${email.template}` };
  }

  const replyAddress = email.replyTo ?? replyTo();

  /* The SDK returns `{ data, error }` and does **not** throw for API errors —
     the `try` is for transport failures (DNS, a dropped socket), which do
     throw and would otherwise escape into the action. */
  try {
    const { data, error } = await getResend().emails.send(
      {
        from: FROM,
        to: [email.to],
        subject: email.subject,
        html,
        text,
        ...(replyAddress ? { replyTo: replyAddress } : {}),
      },
      { idempotencyKey: email.idempotencyKey },
    );

    if (error) {
      // `error.name` only. See the docblock: `message` can quote the address.
      return { sent: false, reason: `${email.template}:${error.name}` };
    }
    if (!data) {
      return { sent: false, reason: `${email.template}:no-id-returned` };
    }
    return { sent: true, id: data.id };
  } catch {
    return { sent: false, reason: `${email.template}:transport-failed` };
  }
}
