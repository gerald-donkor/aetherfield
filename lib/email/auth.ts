import "server-only";

import { createHash } from "node:crypto";

import type { User } from "better-auth";

import { sendEmail } from "./send";
import {
  AccountVerification,
  ACCOUNT_VERIFICATION_SUBJECT,
} from "./templates/account-verification";
import {
  PasswordReset,
  PASSWORD_RESET_SUBJECT,
} from "./templates/password-reset";

type AuthEmailInput = {
  user: User;
  /** Better Auth owns this URL and its credential. Do not reconstruct it. */
  url: string;
  /** Used only to make retries of the same issued credential idempotent. */
  token: string;
};

type AuthEmailEvent = "account-verification" | "password-reset";

function idempotencyKey(
  event: AuthEmailEvent,
  userId: string,
  token: string,
): string {
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  return `auth-${event}/${userId}/${tokenDigest}`;
}

async function settleAuthEmail(
  event: AuthEmailEvent,
  send: ReturnType<typeof sendEmail>,
): Promise<void> {
  try {
    const outcome = await send;
    if (!outcome.sent) {
      // The outcome contains only the template and provider error class.
      console.warn(`[email] ${event} failed: ${outcome.reason}`);
    }
  } catch {
    // Belt and braces: auth responses must not expose provider availability.
    console.warn(`[email] ${event} failed: unexpected-error`);
  }
}

export async function sendAccountVerificationEmail({
  user,
  url,
  token,
}: AuthEmailInput): Promise<void> {
  await settleAuthEmail(
    "account-verification",
    sendEmail({
      to: user.email,
      subject: ACCOUNT_VERIFICATION_SUBJECT,
      body: AccountVerification({ name: user.name, verificationUrl: url }),
      idempotencyKey: idempotencyKey(
        "account-verification",
        user.id,
        token,
      ),
      template: "account-verification",
    }),
  );
}

export async function sendPasswordResetEmail({
  user,
  url,
  token,
}: AuthEmailInput): Promise<void> {
  await settleAuthEmail(
    "password-reset",
    sendEmail({
      to: user.email,
      subject: PASSWORD_RESET_SUBJECT,
      body: PasswordReset({ name: user.name, resetUrl: url }),
      idempotencyKey: idempotencyKey("password-reset", user.id, token),
      template: "password-reset",
    }),
  );
}
