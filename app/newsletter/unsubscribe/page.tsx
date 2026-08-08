import type { Metadata } from "next";

import { AuthShell } from "../../_components/auth/auth-shell";
import { NewsletterTokenAction } from "../../_components/newsletter/token-action";

/**
 * The visible unsubscribe page — reached from the link in the welcome email's
 * footer, and from `/api/newsletter/unsubscribe`'s `GET`.
 *
 * Same shape and the same reasoning as `../confirm/page.tsx`, including why the
 * transition is a button rather than a GET: a mail scanner that follows links
 * would otherwise unsubscribe people who never asked to leave.
 */

export const metadata: Metadata = {
  title: "Unsubscribe — Aetherfield",
  description: "Stop receiving Aetherfield Journal.",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;

  return (
    <AuthShell
      eyebrow="AETHERFIELD JOURNAL"
      title="Unsubscribe"
      introduction="One click, no account, no questions. Unsubscribing takes effect immediately, and this address can subscribe again at any time from the journal."
      alternateLabel="Changed your mind?"
      alternateAction="Read the journal"
      alternateHref="/journal"
    >
      <h2 className="font-sans text-[28px] leading-[32px] font-bold text-balance">
        Stop receiving the journal
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
        Use the button below to remove this address from Aetherfield Journal.
      </p>
      <NewsletterTokenAction kind="unsubscribe" token={value} />
    </AuthShell>
  );
}
