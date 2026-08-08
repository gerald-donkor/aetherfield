import type { Metadata } from "next";

import { AuthShell } from "../../_components/auth/auth-shell";
import { NewsletterTokenAction } from "../../_components/newsletter/token-action";

/**
 * The double opt-in confirmation page — build step 4.
 *
 * **`AuthShell` rather than a new shell.** AGENTS.md 7.5 forbids a second
 * design system, and this page needs exactly what `/sign-in` needs: the sky
 * band, the nav, a titled column beside a white card, and the footer. Its props
 * are plain strings, so nothing about it is auth-specific but its folder.
 *
 * **Dynamic, and only because it reads `searchParams`.** No other route's
 * render mode changes; `/journal` gains a client leaf and keeps its prerender.
 *
 * `noindex`: a page whose entire content is a capability in its query string
 * has no business in a search index.
 */

export const metadata: Metadata = {
  title: "Confirm your subscription — Aetherfield",
  description: "Confirm your subscription to Aetherfield Journal.",
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({
  searchParams,
}: {
  // Async since Next 15, and this is Next 16.
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // A repeated `?token=` yields an array; take the first rather than rejecting,
  // and let the lookup decide whether it is anything.
  const value = Array.isArray(token) ? token[0] : token;

  return (
    <AuthShell
      eyebrow="AETHERFIELD JOURNAL"
      title="Confirm your subscription"
      introduction="Double opt-in: we send a link, you use it, and only then does an address join the list. It is one more click, and it is the reason nothing arrives in an inbox that did not ask for it."
      alternateLabel="Not ready to subscribe?"
      alternateAction="Read the journal"
      alternateHref="/journal"
    >
      <h2 className="font-sans text-[28px] leading-[32px] font-bold text-balance">
        One more step
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[26px] text-muted">
        Use the button below to confirm this address. Nothing is sent to it
        until you do.
      </p>
      <NewsletterTokenAction kind="confirm" token={value} />
    </AuthShell>
  );
}
